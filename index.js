/* index.js - main file of scheduler bot
*   purpose: manage flow of dialogue from user to dialogFlow AI and generate responses
*/
import mongoose from 'mongoose';
import { User } from './models/models';
/* RTMClient is used to listen to messages from user,
* while WebClient is used to send messages back */
const { RTMClient, WebClient } = require('@slack/client');
/* The following functions are defined in google.js and involve the google calendar API */
import { generateAuthCB, googleRoutes, getEvents, setReminder, getAvail, createMeeting } from './google';
/* getUserInfoByID requests information about a user from SLACK API using a user's slack ID */
import { getUserInfoByID } from './routes';
// import axios from 'axios';
/* setting an express server is necessary to host endpoints for
* slack and google to send to for interactive messages and
* permission authentication tokens, respectively */
import express from 'express';
/* request and bodyParser are used to receive and parse information from slack's endpoint */
const request = require('request');
const bodyParser = require('body-parser');
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
/* this middleware includes the endpoint for oauth from google */
app.use('/', googleRoutes);

/* NPM package used to include google's dialogFlow */
import apiai from 'apiai';
var buddyAI = apiai(process.env.APIAI_CLIENT_TOKEN);


if (!process.env.MONGODB_URI) {
  console.error('Cannot find MONGODB_URI.  Run env.sh?');
  process.exit(1);
}
// connected to mongoose
mongoose.connect(process.env.MONGODB_URI);


/* RTM API to be used to receivemessages */
const rtm = new RTMClient(process.env.BOT_SLACK_TOKEN);
// start event listener
rtm.start();
/* Web API to be used to send messages (both interactive and static) */
const web = new WebClient(process.env.BOT_SLACK_TOKEN);

/* specifying styling to be used with JS Date object and toLocaleDateString function */
const dateStyles = {
  weekday: 'short',
  month: 'long',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  year: 'numeric',
};

/* specifying default response message of bot
*   setting subtype as bot_message allows us to filter out bot's messages as
*   the RTM receives them.
*   setting reply_broadcast to true allows for bot to communicate within an APP
*   and only send messages to user who initialized dialogue (as opposed to all users using app)
*/
const defaultResponse = {
  reply_broadcast: true,
  subtype: 'bot_message',
  as_user: true,
}

/* handleAuth - sends message to user asking for permission
*   @param slackID: ID associated with each slack user, to be used in oauth CB
*   @param botResponse: copy of defaultResponse with channel specifed
*   helper functions: generateAuthCB - creating oauth link with slackID
*
*   outcome: a message to user with a link to permissions
*/
const handleAuth = (slackID, botResponse) => {
  botResponse.text = `I need your permission to access google calendar: ${generateAuthCB(slackID)}`;
  web.chat.postMessage(botResponse);
}

/* handleMeeting - sends an interactive message to user, either asking for
*                   confirmation or to resolve a time conflict
*   @param user: mongodb model holding email, google authentication, slackID, etc.
*   @param response: object returned from dialogFLow API as a result of a
*                      request to API using user's input
*   @param botResponse: copy of defaultResponse with channel specifed
*   helper functions:
*     getAvail - queries google calendar API for user's availability
*     getEvents - queries google calendar API for user's availability on startDate
*     generateInteractiveMessage - creates array of object which will be used by slack to create interactive message
*
*   outcome: an interactive message with a confirmation message or a selection
*             menu based on whether there is a time conflict
*/
const handleMeeting = async (user, response, botResponse) => {
  try {
    /* destructure information that dialogFlow parsed and placed in result.parameters */
    let { invitees, day, time, subject, location } = response.result.parameters;
    /* format date as acceptable for en-US JS Date object specificatiosn */
    let startDate = new Date(day.replace(/-/g, '/'));
    /* set time of startDate by parsing clock time hh:mm:ss and
    *     setting hours, minutes, seconds manually */
    let times = time.split(':');
    startDate.setHours(times[0]);
    startDate.setMinutes(times[1]);
    startDate.setSeconds(times[2]);
    /* create an endDate one hour after startDate (default) */
    let endDate = new Date(new Date(startDate).setHours(startDate.getHours()+1));
    /* check for availability on current user's (host of meeting) calendar */
    let availability = await getAvail(user, startDate, endDate);
    /* map slackIDs from the invitees
    * this logic was necessary since dialogFlow was
    *   a) unable to distinguish multiple users after an '@' symbol
    *   b) still includes other characters such as '<',',', and any words in between or after
    */
    let slackIDs = response.result.parameters.invitees
      .map((invitee) => invitee.split('@').map(user => {
        if(user.length > 8){ return user.slice(0,9) }
      })
      .filter((thing) => !!thing))
      .reduce((acc, x) => acc.concat(x), []);
    /*  set botResponse to in_channel to indicate where interactive message is */
    botResponse.response_type = "in_channel";
    /* if the user is not free during the time specified to dialogFlow */
    if(!availability){
      /* get a list of available times the same time between 7 AM and 11 PM */
      let myEvents = await getEvents(user.slackID, new Date(startDate));
      /* create valid interactive message options objects in an array*/
      myEvents = myEvents.map((date) => ({ text: date, value: date }));
      /* set the botResponse text to indicate a time conflcit */
      botResponse.text = "Time Conflicts";
      /* create a selection menu interactive message
      *   list of invitees must be in string form and specified using slack user mention syntax (<@[slackID]>)
      *   conflcit is specified with boolean, true
      *   myEvents represents available times for user to meet
      */
      botResponse.attachments = generateInteractiveMessage(slackIDs.map(slackID => `<@${slackID}>`).join(', '), startDate, endDate, "Meeting", response, true, myEvents);
    } else {
      /* set botResponse to indicate asking for Meeting Confirmation */
      botResponse.text = "Meeting Confirmation";
      /* create a confirm-cancel interactive message
      *   since there are no conflicts, the response and conflict fields do not need to be specified
      *   see generateInteractiveMessage definition for more details
      */
      botResponse.attachments = generateInteractiveMessage(slackIDs.map(slackID => `<@${slackID}>`).join(', '), startDate, endDate, "Meeting");
    }
    /* send message to user in bot app */
    web.chat.postMessage(botResponse);
  } catch (error) {
    /* catch any errors from querying google API*/
    console.error('error in handling meeting.add intent: ', error);
  }
}

/* handleMeeting - sends an interactive message to user, asking to confirm adding reminder
*   @param response: object returned from dialogFLow API as a result of a
*                      request to API using user's input
*   @param botResponse: copy of defaultResponse with channel specifed
*   helper functions:
*     generateInteractiveMessage - creates array of object which will be used by slack to create interactive message
*
*   outcome: interactive confirmation message sent to user
*/
const handleReminder = (response, botResponse) => {
  /* set title text to Reminder */
  botResponse.text = "Reminder Confirmation";
  /* generateInteractiveMessage will need the response from AI API to specify date and subject */
  botResponse.attachments = generateInteractiveMessage(null, null, null, "Reminder", response, false);
  /* send message to user in bot app */
  web.chat.postMessage(botResponse);
}


/*  RTM eventListener - listens for events of type 'message'
*   receives event from slackID
*     for structure of `event`, see https://api.slack.com/events/reaction_added
*   helper functions:
*       getUserInfoByID - if a user does not exist initialize the user
*       handleAuth - ask for user's permission to edit google calendar if it is not granted
*       handleReminder - called if the intent of a user's message is of type 'reminder.add'
*       handleMeeting - called if the intent of a user's message is of type 'meeting.add'
*
*       outcome: if a helper function is not called first,
*                 send default text from dialogFlow's AI
*/
rtm.on('message', async (event) => {
  /* a subtype of a message is only specified for internal messages or messages sent by bots
  *   also ignore any message with a bot_id as it is not from a user
  */
  if(event.subtype || event.bot_id) { return; }
  try {
    /* try to find a user in bot's backend mongoDB */
    let user = await User.findOne({ slackID: event.user });
    /* initialize bot's response with defaultResponse and channel as specified by event */
    let botResponse = Object.assign({}, defaultResponse, {channel: event.channel});
    if(!user){ /* if a user is not found, create one with their slackID, email, name  */
      const user_info = await getUserInfoByID(event.user);
      user = await User.findOrCreate(event.user, user_info.email, user_info.name);
    }
    /* if user has not granted permission, send a message asking for it */
    if(!user.googleCalAuth) {
      return handleAuth(event.user, botResponse);
    }
    /* create request to dialogFlow AI using text from event */
    const request = buddyAI.textRequest(event.text, {
      sessionId: event.user
    });
    /* event listener on event type 'response' from dialogFlow */
    request.on('response', async function(response) {
        /* parse intent as action or intentName (different depending on intent)*/
        const intent = response.result.action || response.result.metadata.intentName;
        /* if the intent of the message concerns scheduling */
        if(intent === 'meeting.add' || intent === 'reminder.add'){
          // TODO: is this part necessary
          // if(!user.googleCalAuth){
          //   return handleAuth(event.user, botResponse);
          // }
          /* check if the action is complete */
          if(!response.result.actionIncomplete) {
            /* call relevant helper functions according to intent */
            if(intent === 'meeting.add') {
              return handleMeeting(user, response, botResponse);
            }
            if (intent === 'reminder.add') {
              return handleReminder(response, botResponse);
            }
          }
        }
        /* set bot's response text to that returned by buddyAI, when:
        *   - response is incomplete
        *   - request has another intent i.e. 'hello'
        */
        botResponse.text = response.result.fulfillment.speech;
        /* send out message to user on app channel */
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
    /* catch any errors from using mongoDB */
    console.error('caught error in rtm.on(message)', err);
  }
});


/*  generateInteractiveMessage - helper function creating interactive message
*   @param invitees: specifies those invited (if intent is meeting.add) in form of a string joined by comma-space
*   @param startDate: date object specifying start datetime or date
*   @param endDate: date object specifying end datetime or date
*   @param eventType: 'Meeting' or 'Reminder'
*   @param response: dialogFlow's response from user's text
*   @param conflict: boolean of user's availability
*
*   returns: array suitable for slack message attachments field
*/
const generateInteractiveMessage = (invitees, startDate, endDate, eventType, response, conflict, evs) => {
  /* check if user is attempting to schedule a meeting within 4 hours*/
  if(startDate-(1000*60*60*4) < new Date() && eventType == "Meeting") {
    return [{
      "title": "You cannot schedule less than 4 hours ahead."
    }];
  }
  return [
    {
      "fields": [
        // if event is of type reminder, specify what the reminder is for
        eventType === "Reminder" ?
        {
          "title": "What",
          "value": `${response.result.parameters.subject}`
        } : {
        // else specify invitees to meeting
            "title": "With Whom",
            "value": invitees
        },
        /* always specify the date, either as a day, or as a datetime string,
            using dateStyles object for formatting  */
        {
          "title": "Date",
          "value": eventType==="Reminder" ? `${response.result.parameters.date}`:
          `${startDate.toLocaleDateString("en-US", dateStyles)}-${endDate.toLocaleDateString("en-US", dateStyles)}`,
        },
      ]
    },
    /* create a message based on whether there is a conflict or not */
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

/* endpoint for slack to post to upon a user's interaction with interactive message
* helperFunction:
*   handleCreateEventPromise - sicne google calendar functions return promises,
*       so this function specifies whether to return a success or error message
*/
app.post('/slack/actions', (req,res) => {
  /* apparently polite for us to send an acknowledgment in the form of a 200 status */
  res.status(200).end();
  /* destructure payload received from slack's API */
  const { callback_id, actions, user, channel, original_message } = JSON.parse(req.body.payload);
  /* create botResponse template specifying channel and using defaultResponse as backbone */
  let botResponse = Object.assign({}, defaultResponse, {channel: channel.id});
  /* switch based on whether */
  switch(callback_id) {
      case "reminderConfirm":
          /* if the user hits confirm, create reminder */
          if(actions[0].name === "confirm") {
            /* get date and subject of reminder from archive of original_message sent by slack API*/
            let parameters = original_message.attachments[0].fields.map(obj => obj.value);
            /* pass in promise to create reminder, 0 to specify a reminder event
            *     type, and botResponse to send to user */
            handleCreateEventPromise(setReminder(user.id, parameters), 0, botResponse);
          }
          return;
      case "timeConflictsChoice":
          /* grab invitees, newly specifed startDate from archived original_message sent by slack API */
          const invitees = original_message.attachments[0].fields[0].value;
          const startDate = new Date(actions[0].selected_options[0].value);
          /* create new endDate from specified startDate */
          const endDate = new Date(new Date(startDate).setHours(startDate.getHours() + 1));
          /* create meeting confirmation interactive message including invitees, startDate, endDate */
          botResponse.attachments = generateInteractiveMessage(invitees, startDate, endDate, "Meeting");
          /* end with sending message to user through app channel */
          return web.chat.postMessage(botResponse);
      case "meetingConfirm":
          /* if the user hits confirm, create reminder */
          if(actions[0].name === "confirm") {
            /* set parameters as object specifying slackID, invitees, startDate, endDate */
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
            /* pass in promise to create reminder, 1 to specify a meeting event
            *     type, and botResponse to send to user */
            handleCreateEventPromise(createMeeting(parameters), 1, botResponse);
          }
          return;
    }
})

/* handleCreateEventPromise - helper function to generateInteractiveMessage
*   @param promise - event promise returned from ./google indicating whether
*                   events (reminders or meetings) were successfully added to
*                   mongoDB and google calendar
*   @param type - number treated as boolean, indicating whether  promise is
*                 for a meeting or reminder
*   @param botResponse: copy of defaultResponse with channel specifed
*
*   outcome: send message to user through app channel
*/
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
* listen to requests here 
*/
app.listen(3000);
