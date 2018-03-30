import mongoose from 'mongoose';
const express = require('express');
import { User } from './models/models';
const { RTMClient, WebClient } = require('@slack/client');
import { generateAuthCB, googleRoutes, getEvents, setReminder, getAvail, createMeeting } from './google';
import { getUserInfoByID } from './routes';
import axios from 'axios';
const request = require('request')
const bodyParser = require('body-parser')
const app = express()
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



/* RTM API to be used to respond to messages ?
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
  let { message } = event;
  if(!message){ message = event; }
  if(message !== event) /*console.log('message: ', message);*/
  if ((message.subtype && message.subtype === 'bot_message') ||
       (!message.subtype && message.user === rtm.activeUserId) ) {
         console.log(message);
    return;
  }
  console.log(event);
  try {
    let user = await User.findOne({ slackID: event.user });
    if(!user){
      const user_info = await getUserInfoByID(event.user);
      user = await User.findOrCreate(event.user, user_info.email, user_info.name);
    }
    // let user = await User.findOrCreate(event.user, user_email);
    let botResponse = Object.assign({}, defaultResponse, {channel: event.channel});
    const request = test.textRequest(event.text, {
      sessionId: event.user
    });
    // console.log('found user');
    request.on('response', function(response) {
        // console.log('response.result: ', response.result);
        if(response.result.action === 'meeting.add' || response.result.action === 'reminder.add'){
          if(!user.googleCalAuth)
          {
            botResponse.text = `I need your permission to access google calendar: ${generateAuthCB(event.user)}`;
            let res = rtm.addOutgoingEvent(false, 'message', botResponse);
            return;
            // let res = await web.chat.postMessage({ channel: event.channel, text: response.text, subtype: 'bot_message' })
            // console.log('auth request sent in ', res.ts);
          }

          // console.log('what to send back: ', response.result.fulfillment.speech);
          // console.log('currently recorded params: ', response.result.parameters);
          // console.log('this conversation is not yet complete: ', response.result.actionIncomplete);

          //TO-DO: Google calendar handling once all parameters are filled out
          if(!response.result.actionIncomplete) {
            // console.log('messages: ',response.result.fulfillment.messages);
            //Add a google calendar event with [invitees, day, time] as params
            //& [subject, location] as optional params
            // console.log(response.result.metadata.intentName, response.result.metadata.intentName === 'meeting.add')
            if(response.result.metadata.intentName === 'meeting.add') {
              console.log('meeting to use this info: ', response.result);
              // let getAvail = await getAvail(slackID);
              createMeeting(user, response.result.parameters);
            }

            //Add a google calendar event with [date, subject] -> as params
            if (response.result.action === 'reminder.add') {
              console.log('response beginning');
              let confirm = {
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

              // Object.assign(botResponse, resp)
              // .text = confirm;
              // // botResponse.attachments = confirm.attachments;

              console.log(botResponse);

              // setReminder(event.user, response.result.parameters.subject, response.result.parameters.date.replace(/-/g, '/'));

              web.chat.postMessage({
                "channel": event.channel,
                "as_user" : true,
                "attachments": [{
                  "text": response.result.fulfillment.speech,
                  "fallback": "Unable to confirm a Reminder or Meeting",
                  "callback_id": "confirm",
                  "actions": [
                    { "type": "button", "name": "select", "value": "yes", "text": "Confirm" },
                    { "type": "button", "name": "select", "value": "no", "text": "Cancel", "style": "danger" }
                  ]
                }]
              }, (err, res) => {
                if(err) {
                  console.error(err);
                }else{
                  console.log(res);
                }
                return;
              });

              console.log('did it work? ', confirm)
              return;
              // web.chat.postMessage(botResponse);
              // return;

            }
          }
        }
        // console.log(response);
        else {
          botResponse.text = response.result.fulfillment.speech;
        }
        // botResponse.thread_ts = event.ts;
        // console.log('time checkin: ', event);

        console.log("buddy's response: ", botResponse);
        console.log("type: ", response.result.metadata.intentName);
        //how to check whether this line is working???
        // web.chat.postMessage(botResponse);
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
  console.log('in actions: ',req.body);
  res.status(200).end()
})
/*
* listen here
*/
app.listen(3000);
