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

const handleAuth = (slackID, botResponse) => {
  botResponse.text = `I need your permission to access google calendar: ${generateAuthCB(slackID)}`;
  web.chat.postMessage(botResponse);
}

const handleMeeting = async (user, response, botResponse) => {
  try {
    let { invitees, day, time, subject, location } = response.result.parameters;
    let startDate = new Date(day.replace(/-/g, '/'));
    let times = time.split(':');
    startDate.setHours(times[0]);
    startDate.setMinutes(times[1]);
    startDate.setSeconds(times[2]);
    let endDate = new Date(new Date(startDate).setHours(startDate.getHours()+1));
    let availability = await getAvail(user, startDate, endDate);
    let slackIDs = response.result.parameters.invitees
      .map((invitee) => invitee.split('@').map(user => {
        if(user.length > 8){
          return user.slice(0,9)
        }
      })
      .filter((thing) => !!thing))
      .reduce((acc, x) => acc.concat(x), []);
      botResponse.response_type = "in_channel";
      botResponse.text = "Meeting Confirmation";
    if(!availability){
      let myEvents = await getEvents(user.slackID, new Date(startDate));
      myEvents = myEvents.map((date) => ({ text: date, value: date }));
      botResponse.text = "Time Conflicts";
      botResponse.attachments = generateInteractiveMessage(slackIDs.map(slackID => `<@${slackID}>`).join(', '), startDate, endDate, "Meeting", response, true, myEvents);
    } else {
      botResponse.attachments = generateInteractiveMessage(slackIDs.map(slackID => `<@${slackID}>`).join(', '), startDate, endDate, "Meeting");
    }
    web.chat.postMessage(botResponse);
  } catch (error) {
    console.error('error in handling meeting.add intent: ', error);
  }
}


const handleReminder = (response, botResponse) => {
  botResponse.text = "Reminder Confirmation";
  botResponse.attachments = generateInteractiveMessage(null, null, null, "Reminder", response, false)
  web.chat.postMessage(botResponse);
}

rtm.on('message', async (event) => {
  // For structure of `event`, see https://api.slack.com/events/reaction_added
  if(event.subtype || event.bot_id) { return; }
  try {
    let user = await User.findOne({ slackID: event.user });
    let botResponse = Object.assign({}, defaultResponse, {channel: event.channel});
    if(!user){
      const user_info = await getUserInfoByID(event.user);
      user = await User.findOrCreate(event.user, user_info.email, user_info.name);
      return handleAuth(event.user, botResponse);
    }
    const request = test.textRequest(event.text, {
      sessionId: event.user
    });

    request.on('response', async function(response) {
        // console.log('response.result: ', response.result);
        const intent = response.result.action || response.result.metadata.intentName;
        if(intent === 'meeting.add' || intent === 'reminder.add'){
          if(!user.googleCalAuth){
            return handleAuth(event.user, botResponse);
          }
          if(!response.result.actionIncomplete) {
            if(intent === 'meeting.add') {
              return handleMeeting(user, response, botResponse);
            }
            if (intent === 'reminder.add') {
              return handleReminder(response, botResponse);
            }
          }
        }
        botResponse.text = response.result.fulfillment.speech;
        web.chat.postMessage(botResponse);
      })

      // handle error from dialogFlow
      request.on('error', function (error) {
        console.error('error from dialogFlow: ', error);
        return;
      })
      // terminate request from dialogFlow
      request.end();
  } catch (err) {
    console.error('caught error in rtm.on(message)', err);
  }
});


/*  generateInteractiveMessage - helper function creating interactive message
*   @param users:
*   @param startDate:
*   @param endDate:
*   @param eventType: 'Meeting' or 'Reminder'
*   @param response: dialogFlow
*   @param conflict: boolean of availability
*
*/
const generateInteractiveMessage = (users, startDate, endDate, eventType, response, conflict, evs) => {
  if(startDate-(1000*60*60*4) < new Date() && eventType == "Meeting") {
    return [{
      "title": "You cannot schedule less than 4 hours ahead."
    }];
  }
  return [
    {
      // "title": conflict ? `Time Conflicts`: `${eventType} Confirmation`,
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
    res.status(200).end();
    const { callback_id, actions, user, channel, original_message } = JSON.parse(req.body.payload);
    let botResponse = {channel: channel.id, subtype: 'bot_message', as_user: true}

    switch(callback_id){
      case "reminderConfirm":
          if(actions[0].name === "confirm") {
            let parameters = original_message.attachments[0].fields.map(obj => obj.value);
            handleCreateEventPromise(setReminder(user.id, parameters), 0, botResponse);
          }
          return;
      case "timeConflictsChoice":
          const users = original_message.attachments[0].fields[0].value;
          const startDate = new Date(actions[0].selected_options[0].value);
          const endDate = new Date(new Date(startDate).setHours(startDate.getHours() + 1));
          botResponse.attachments = generateInteractiveMessage(users, startDate, endDate, "Meeting");
          return web.chat.postMessage(botResponse);
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
