import mongoose from 'mongoose';
import { User } from './models/models';
const { RTMClient, WebClient } = require('@slack/client');
import { generateAuthCB, googleRoutes, getEvents, setReminder, getAvail, createMeeting } from './google';
import { getUserInfoByID } from './routes';
import axios from 'axios';
import express from 'express';
const request = require('request');
const bodyParser = require('body-parser');
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use('/', googleRoutes);
import apiai from 'apiai';
var test = apiai(process.env.APIAI_CLIENT_TOKEN);


if (!process.env.MONGODB_URI) {
  console.error('Cannot find MONGODB_URI.  Run env.sh?');
  process.exit(1);
}
// connected to mongoose
mongoose.connect(process.env.MONGODB_URI);



/* RTM API to be used to respond to messages
*/
const rtm = new RTMClient(process.env.BOT_SLACK_TOKEN);
rtm.start();
/*
* Web API to be used to parse through messages ?
*/
const web = new WebClient(process.env.BOT_SLACK_TOKEN);

/* WEBHOOK needed to communicate with slack server and slack server to our app */
const currentTime = new Date().toTimeString();

const defaultResponse = {
  reply_broadcast: true,
  subtype: 'bot_message',
}

rtm.on('message', async (event) => {
  // For structure of `event`, see https://api.slack.com/events/reaction_added
  if(event.subtype || event.bot_id) { return; }
  console.log(event);
  try {
    let user = await User.findOne({ slackID: event.user });
    console.log('user: ', user);
    if(!user){
      console.log('user not found!');
      const user_info = await getUserInfoByID(event.user);
      user = await User.findOrCreate(event.user, user_info.email, user_info.name);
    }

    // getEvents(event.user, new Date());
    // let user = await User.findOrCreate(event.user);
    let botResponse = Object.assign({}, defaultResponse, {channel: event.channel});
    const request = test.textRequest(event.text, {
      sessionId: event.user
    });
    console.log('SLACKID : ',event.user);
    // console.log('found user');
    request.on('response', async function(response) {
        // console.log('response.result: ', response.result);
        if(response.result.metadata.intentName === 'meeting.add' || response.result.action === 'reminder.add'){
          if(!user.googleCalAuth)
          {
            console.log('not authorized?');
            botResponse.text = `I need your permission to access google calendar: ${generateAuthCB(event.user)}`;
            rtm.addOutgoingEvent(false, 'message', botResponse);
            return;
          }

          console.log('what to send back: ', response.result.fulfillment.speech);
          console.log('currently recorded params: ', response.result.parameters);
          console.log('this conversation is not yet complete: ', response.result.actionIncomplete);

          if(!response.result.actionIncomplete) {
            // console.log('messages: ',response.result.fulfillment.messages);
            //Add a google calendar event with [invitees, day, time] as params
            //& [subject, location] as optional params
            // console.log(response.result.metadata.intentName, response.result.metadata.intentName === 'meeting.add')
            if(response.result.metadata.intentName === 'meeting.add') {
              console.log('meeting to use this info: ', response.result);
              let { invitees, day, time, subject, location } = response.result.parameters;
              let startDate = new Date(day.replace(/-/g, '/'));
              let times = time.split(':');
              startDate.setHours(times[0]);
              startDate.setMinutes(times[1]);
              startDate.setSeconds(times[2]);
              let endDate = new Date(new Date(startDate).setHours(startDate.getHours()+1));
              let availability = null;
              try {
                availability = await getAvail(user, startDate, endDate);
                console.log(availability)
              } catch (err){
                console.error(err);
                return;
              }
              // TODO: make this an options menu
              // let message = Object.assign({},defaultResponse,);
              // if(!availability){
                botResponse.text = "*Time Conflicts*";
                botResponse.mrkdwn = true;
                botResponse.attachments = [
                  {
                    "title": `${subject || 'Meeting'}`,
                    "pretext": 'please choose another time'
                  },
                  {
                    "text": "Choose a time that conflicts",
                    "color": "#3AA3E3",
                    "attachment_type": "default",
                    "fallback": "That time conflicts, here are other options: ",
                    "title": "That time conflicts, here are other options: ",
                    "callback_id": "timeConflictsChoice",
                    "color": "#3AA3E3",
                    "attachment_type": "default",
                    "actions": [{
                      "name": "pick_meeting_time",
                      "text": "Pick a time...",
                      "type": "select",
                      "options": getEvents(event.user, startDate).map((date) => {
                        return { text: date, value: date }
                      })
                    }]
                  }
                ]
                web.chat.postMessage(botResponse);
              // } else {
              //   console.log('would create meeting here');
              //   // createMeeting(user, response.result.parameters);
              // }
              /*
              TODO : decide on flow of info
              - check availability - then
              */
            }

            //Add a google calendar event with [date, subject] -> as params
            if (response.result.action === 'reminder.add') {
              console.log('inside reminder.add');
              /*let confirm = {
                "text": "Scheduling Confirmation",
                "attachments": [
                  {
                    "title": "${name of the event}",
                    "pretext": "can this work?",
                    "fields": [
                      {
                        "title": "Date",
                        "value": "{date}",
                        "short": true
                      },
                      {
                        "title": "Time",
                        "value": "{time}",
                        "short": true
                      },
                      {
                        "title": "With",
                        "value": "{people}",
                        "short": true
                      }
                    ]
                  },
                  {
                    "title": "Hey!",
                    "text": "I have created your event!"
                  },
                  {
                    "fallback": "Are you sure you want me to add this to your calendar?",
                    "title": "Are you sure you want me to add this to your calendar?",
                    "callback_id": "comic_1234_xyz",
                    "color": "#3AA3E3",
                    "attachment_type": "default",
                    "actions": [
                      {
                        "name": "yes",
                        "text": "Yes",
                        "type": "button",
                        "value": "confirm"
                      },
                      {
                        "name": "no",
                        "text": "No",
                        "type": "button",
                        "value": "no"
                      }
                    ]
                  }
                ]
              };

              const resp = Object.assign({}, confirm, {channel: event.channel});
              console.log(botResponse);
              */
              // setReminder(event.user, response.result.parameters.subject, response.result.parameters.date.replace(/-/g, '/'));

              web.chat.postMessage({
                "channel": event.channel,
                "subtype": 'bot_message',
                "as_user" : true,
                "text": "Scheduling Confirmation",
                "attachments": [
                  {
                    "title": `Reminder`,
                    "fields": [
                      {
                        "title": "Date",
                        "value": `${response.result.parameters.date}`,
                      },
                      {
                        "title": "What",
                        "value": `${response.result.parameters.subject}`
                      }
                    ]
                  },
                  {
                    "fallback": "Are you sure you want me to add this to your calendar?",
                    "title": "Are you sure you want me to add this to your calendar?",
                    "callback_id": "reminderConfirm",
                    "color": "#3AA3E3",
                    "attachment_type": "default",
                    "actions": [
                      {
                        "name": "confirm",
                        "text": "*confirm*",
                        "type": "button",
                        "value": "confirm",
                        "mrkdwn": true,
                      },
                      {
                        "name": "no",
                        "text": "no",
                        "type": "button",
                        "value": "no"
                      }
                    ]
                  }
                ]
              });
              return;
            }
          } else {
            botResponse.text = response.result.fulfillment.speech;
          }
        } else {
          botResponse.text = response.result.fulfillment.speech;
        }
        // botResponse.thread_ts = event.ts;
        // console.log('time checkin: ', event);

        console.log("buddy's response: ", botResponse);
        console.log("type: ", response.result.metadata.intentName);
        rtm.addOutgoingEvent(response.result.actionIncomplete, 'message', botResponse);

      })


      request.on('error', function (error) {
        // console.log(error);
      });

      request.end();
  } catch (err) {
    console.error(err);
  }
});




app.post('/slack/actions', (req,res) => {
    res.status(200).end()
    const { callback_id, actions, user, channel, original_message } = JSON.parse(req.body.payload);
    if(actions[0].name !== "confirm") { return; }
    let botResponse = {channel: channel.id, subtype: 'bot_message', as_user: true}
    switch(callback_id){
      case "reminderConfirm":
          let parameters = original_message.attachments[0].fields.map(obj => obj.value);
          setReminder(user.id, parameters)
          .then(() => {
              botResponse.text = "I\'ve successfully updated your calendar";
              web.chat.postMessage(botResponse);
          })
          .catch(error => {
            botResponse.text = `hmm I got this error when trying to add reminder:\n${typeof error === 'object' ? JSON.stringify(error) : error}`;
            web.chat.postMessage(botResponse)
          })
    }
})
/*
* listen here
*/
app.listen(3000);
