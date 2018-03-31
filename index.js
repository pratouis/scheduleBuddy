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

const dateStyles = {
  weekday: 'short',
  month: 'long',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  year: 'numeric',
};

const defaultResponse = {
  reply_broadcast: true,
  subtype: 'bot_message',
  as_user: true,
}

rtm.on('message', async (event) => {
  // For structure of `event`, see https://api.slack.com/events/reaction_added
  if(event.subtype || event.bot_id) { return; }
  try {
    let user = await User.findOne({ slackID: event.user });
    if(!user){
      console.log('user not found!');
      const user_info = await getUserInfoByID(event.user);
      user = await User.findOrCreate(event.user, user_info.email, user_info.name);
    }


    let botResponse = Object.assign({}, defaultResponse, {channel: event.channel});
    const request = test.textRequest(event.text, {
      sessionId: event.user
    });

    request.on('response', async function(response) {
        // console.log('response.result: ', response.result);
        if(response.result.metadata.intentName === 'meeting.add' || response.result.action === 'reminder.add'){
          if(!user.googleCalAuth)
          {
            console.error('not authorized?!!');
            botResponse.text = `I need your permission to access google calendar: ${generateAuthCB(event.user)}`;
            rtm.addOutgoingEvent(false, 'message', botResponse);
            return;
          }

          // console.log('what to send back: ', response.result.fulfillment.speech);
          // console.log('currently recorded params: ', response.result.parameters);
          // console.log('this conversation is not yet complete: ', response.result.actionIncomplete);

          if(!response.result.actionIncomplete) {
            if(response.result.metadata.intentName === 'meeting.add') {
              // console.log('meeting to use this info: ', response.result);

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
                console.log('availablity: ', availability)
              } catch (err){
                console.error(err);
                return;
              }
              // TODO: make this an options menu
              // let message = Object.assign({},defaultResponse,);
              let slackIDs = response.result.parameters.invitees
                .map((invitee) => invitee.split('@').map(user => {
                  if(user.length > 8){
                    return user.slice(0,9)
                  }
                })
                .filter((thing) => !!thing))
                .reduce((acc, x) => acc.concat(x), []);

              if(!availability){

                let myEvents = await getEvents(event.user, new Date(startDate));

                myEvents = myEvents.map((date) => {

                  return { text: date, value: date }
                });
                botResponse.response_type = "in_channel";
                //console.log(slackIDs);
                botResponse.attachments = generateMeetingConfirmation(slackIDs.map(slackID => `<@${slackID}>`).join(', '), startDate, endDate, "Meeting", response, true, myEvents)
                // [
                //   {
                //     "title": "Time Conflicts",
                //     "fields": [
                //       {
                //         "title": "With Whom",
                //         "value": slackIDs.map(slackID => `<@${slackID}>`).join(', '),
                //       },
                //       {
                //         "title": "Proposed Time",
                //         "value": `${startDate.toLocaleDateString("en-US", dateStyles)}-${endDate.toLocaleDateString("en-US", dateStyles)}`,
                //       }
                //     ]
                //   },
                //   {
                //     "text": "Choose a time that conflicts",
                //     "color": "#3AA3E3",
                //     "attachment_type": "default",
                //     "fallback": "That time conflicts, here are other options: ",
                //     "callback_id": "timeConflictsChoice",
                //     "color": "#3AA3E3",
                //     "attachment_type": "default",
                //     "actions": [{
                //       "name": "pick_meeting_time",
                //       "text": "Pick a time...",
                //       "type": "select",
                //       "options": myEvents
                //     }]
                //   }
                // ]
              } else {
                console.log('available: sending Meeting Confirmation');
                botResponse.attachments = generateMeetingConfirmation(slackIDs.map(slackID => `<@${slackID}>`).join(', '), startDate, endDate, "Meeting", null, null, null);
              }
              web.chat.postMessage(botResponse);
              return;
              /*
              TODO : decide on flow of info
              - check availability - then
              */
            }

            //Add a google calendar event with [date, subject] -> as params
            if (response.result.action === 'reminder.add') {
              console.log('inside reminder.add');
              /*
              const resp = Object.assign({}, confirm, {channel: event.channel});
              console.log(botResponse);
              */
              botResponse.text = "Scheduling Confirmation";
              botResponse.attachments = generateMeetingConfirmation(null, null, null, "Reminder", response, false)
              // [
              //   {
              //     "title": `Reminder`,
              //     "fields": [
              //       {
              //         "title": "Date",
              //         "value": `${response.result.parameters.date}`,
              //       },
              //       {
              //         "title": "What",
              //         "value": `${response.result.parameters.subject}`
              //       }
              //     ]
              //   },
              //   {
              //     "fallback": "Are you sure you want me to add this to your calendar?",
              //     "title": "Are you sure you want me to add this to your calendar?",
              //     "callback_id": "reminderConfirm",
              //     "color": "#3AA3E3",
              //     "attachment_type": "default",
              //     "actions": [
              //       {
              //         "name": "confirm",
              //         "text": "*confirm*",
              //         "type": "button",
              //         "value": "confirm",
              //         "mrkdwn": true,
              //       },
              //       {
              //         "name": "no",
              //         "text": "no",
              //         "type": "button",
              //         "value": "no"
              //       }
              //     ]
              //   }
              // ];
              console.log('botResponse: ', botResponse);
              web.chat.postMessage(botResponse, (err, res) => {
                if(err) console.error(err)
                else console.log(res)
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
    console.log('caught error in rtm.on(message)');
    console.error(err);
  }
});

// TODO helper function that generates meeting message
/*
*   @params eventType: 'Meeting' or 'Reminder'
*   @params response: dialogFlow
*   @params conflict: boolean of availability
*
*/
const generateMeetingConfirmation = (users, startDate, endDate, eventType, response, conflict, evs) => {
  // console.log("users", users)
  // console.log("eventType", eventType)
  // if(eventType === "Meeting"){
  //   console.log("startdate: ", startDate.toLocaleDateString("en-US", dateStyles));
  //   console.log('enddate: ', endDate.toLocaleDateString("en-US", dateStyles));
  //
  // }else{
  //   console.log('date: ', response.result.parameters.date);
  // }
  if(startDate-(1000*60*60*4) < new Date() && eventType == "Meeting") {
    return [{
      "title": "You cannot schedule less than 4 hours ahead."
    }];
  }
  return [
    {
      "title": conflict ? `Time Conflicts`: `${eventType} Confirmation`,
      "fields": [
        eventType === "Reminder" ?
        {
          "title": "What",
          "value": `${response.result.parameters.subject}`
        } : {
            "title": "With Whom",
            "value": users
        },
        {
          "title": "Date",
          "value": eventType==="Reminder" ? `${response.result.parameters.date}`:
          `${startDate.toLocaleDateString("en-US", dateStyles)}-${endDate.toLocaleDateString("en-US", dateStyles)}`,
        },
      ]
    },
    {
      "fallback": conflict ? "That time conflicts, here are other options: ":"Are you sure you want me to add this to your calendar?",
      "title": conflict ? "Choose a time that does not conflict" : "Are you sure you want me to add this to your calendar?",
      "callback_id": conflict ? "timeConflictsChoice": `${eventType.toLowerCase()}Confirm`,
      "color": "#3AA3E3",
      "attachment_type": "default",

      "actions": conflict ? [{
        "name": "pick_meeting_time",
        "text": "Pick a time...",
        "type": "select",
        "options": evs
      }] :[
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
  ];
}

app.post('/slack/actions', (req,res) => {
    console.log('hello here');
    res.status(200).end();
    const { callback_id, actions, user, channel, original_message } = JSON.parse(req.body.payload);
    // console.log('actions: ',actions[0].selected_options);
    // console.log('callback_id: ', callback_id)

    let botResponse = {channel: channel.id, subtype: 'bot_message', as_user: true}
    if(callback_id === 'timeConflictsChoice') {
      console.log(callback_id)
    }
    console.log('callback_id: ', callback_id, typeof callback_id)
    switch(callback_id){
      case "reminderConfirm":
          if(actions[0].name === "confirm") {
            let parameters = original_message.attachments[0].fields.map(obj => obj.value);
            handleCreateEventPromise(setReminder(user.id, parameters), 0, botResponse);
          }
          return;
      case "timeConflictsChoice":
          console.log('inside timeConflictsChoice');
          const users = original_message.attachments[0].fields[0].value;
          console.log('selected_options keys: ',Object.keys(actions[0].selected_options[0]));
          console.log('actions: ',actions[0]);
          // console.log(Object.keys(actions[0]));
          const startDate = new Date(actions[0].selected_options[0].value);
          console.log(typeof startDate);
          console.log(startDate.toLocaleDateString('en-US', dateStyles));
          const endDate = new Date(new Date(startDate).setHours(startDate.getHours() + 1));
          botResponse.attachments = generateMeetingConfirmation(users, startDate, endDate, "Meeting");
          console.log('about to post pack');
          web.chat.postMessage(botResponse);
          return;
      case "meetingConfirm":
          if(actions[0].name === "confirm") {
            let parameters = { slackID : user.id };
            original_message.attachments[0].fields.forEach((obj) => {
              if(obj.title.indexOf('Whom') > -1){
                parameters.invitees = obj.value.split(', ').map((slackID) => slackID.replace(/[\@\<\>]/g,''));
              }else{
                const dates = obj.value.split('-');
                parameters.startDate = dates[0];
                parameters.endDate = dates[1];
              }
            });
            // console.log('meeting Confirm parameters: ',parameters);
            handleCreateEventPromise(createMeeting(parameters), 1, botResponse);
          }
          return;
    }
})

const handleCreateEventPromise = (promise, type, botResponse) => {
  promise.then(() => {
    botResponse.text = "I\'ve successfully updated your calendar";
    web.chat.postMessage(botResponse);
  }).catch(error => {
    console.error('error caught in handling promise: ', error);
    botResponse.text = `hmm I got this error when trying to add ${type ? 'meeting' : 'reminder'}:\n${typeof error === 'object' ? JSON.stringify(error) : error}`;
    web.chat.postMessage(botResponse);
  })
}
/*
* listen here
*/
app.listen(3000);
