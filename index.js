import mongoose from 'mongoose';
import { User } from './models/models';
const { RTMClient, WebClient } = require('@slack/client');
<<<<<<< HEAD
import { generateAuthCB, googleRoutes, getEvents } from './google';
import { getUserEmailByID } from './routes';

import express from 'express';
import axios from 'axios';
import bodyParser from 'body-parser';
const app = express();
const urlencodedParser = bodyParser.urlencoded({ extended: false });
//app.use('/', googleRoutes);
=======
import { generateAuthCB, googleRoutes, getEvents, setReminder, getAvail, createMeeting } from './google';
import { getUserInfoByID } from './routes';
import axios from 'axios';
const app = express();
app.use('/', googleRoutes);
import apiai from 'apiai';

var test = apiai(process.env.APIAI_CLIENT_TOKEN);

>>>>>>> adddba16533cf6861e427f727b54a9c68ef27d99

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
// const web = new WebClient(process.env.SLACK_TOKEN);

const defaultResponse = {
<<<<<<< HEAD
    "text": "you're a stupid bundle of sunshine.",
    "attachments": [
        {
            "text": "Choose a game to play",
            "fallback": "You are unable to choose a game",
            "callback_id": "wopr_game",
            "color": "#3AA3E3",
            "attachment_type": "default",
            "actions": [
                {
                    "name": "game",
                    "text": "Chess",
                    "type": "button",
                    "value": "chess"
                },
                {
                    "name": "game",
                    "text": "Falken's Maze",
                    "type": "button",
                    "value": "maze"
                },
                {
                    "name": "game",
                    "text": "Thermonuclear War",
                    "style": "danger",
                    "type": "button",
                    "value": "war",
                    "confirm": {
                        "title": "Are you sure?",
                        "text": "Wouldn't you prefer a good game of chess?",
                        "ok_text": "Yes",
                        "dismiss_text": "No"
                    }
                }
            ]
        }
    ]
=======
  reply_broadcast: true,
  subtype: 'bot_message',
>>>>>>> adddba16533cf6861e427f727b54a9c68ef27d99
}

rtm.on('message', async (event) => {
  // For structure of `event`, see https://api.slack.com/events/reaction_added
  // let { message } = event;
  // if(!message){ message = event;}
  // if(message !== event) /*console.log('message: ', message);*/
  if ((event.subtype && event.subtype === 'bot_message') ||
       (!event.subtype && event.user === rtm.activeUserId) ) {
    return;
  }
  // if(event !== event){
  //   // console.log('message: ', message);
  // }
  console.log('event: ', event);
  try {
<<<<<<< HEAD
    console.log('inside event')
    const user_email = await getUserEmailByID(event.user);
    // console.log(user_email)
    if(typeof user_email !== "string") {
      throw `no bueno, user_email is typeof ${typeof user_email}`;
    }
    // TODO @backend let's look at associating google calendar oauth with slack acct
    let user = await User.findOrCreate(event.user, user_email);
    const response = Object.assign({}, defaultResponse, {channel: event.channel});
    // if(! user.googleCalAuth) {
    //   response.text = `I need your permission to access google calendar: ${generateAuthCB(event.user)}`;
    //   let res = await rtm.addOutgoingEvent(true, 'message', response);
    // } else {
    //   response.text = 'hi hello';
    //   // let success = await rtm.addOutgoingEvent(true, 'message', response)
    //   // getEvents(event.user)
    //   console.log('Message sent: ', success.ts);
    // }

    //response.text = event.text;
    let res = await rtm.addOutgoingEvent(true, 'message', response);
=======
    let user = await User.findOne({ slackID: event.user });
    if(!user){
      const user_info = await getUserInfoByID(event.user);
      user = await User.findOrCreate(event.user, user_info.email, user_info.name);
    }

    // let user = await User.findOrCreate(event.user);
    const botResponse = Object.assign({}, defaultResponse, {channel: event.channel});
    const request = test.textRequest(event.text, {
      sessionId: event.user
    });
    // getAvail(event.user);
    // getEvents(event.user);
    request.on('response', function(response) {
      console.log('response result: ', response);
        if(response.result.metadata.intentName === 'meeting.add' || response.result.action === 'reminder.add'){
          if(!user.googleCalAuth)
          {
            botResponse.text = `I need your permission to access google calendar: ${generateAuthCB(event.user)}`;
            let res = rtm.addOutgoingEvent(false, 'message', botResponse);
            return;
            // let res = await web.chat.postMessage({ channel: event.channel, text: response.text, subtype: 'bot_message' })
            // console.log('auth request sent in ', res.ts);
          }

          console.log('what to send back: ', response.result.fulfillment.speech);
          console.log('currently recorded params: ', response.result.parameters);
          console.log('this conversation is not yet complete: ', response.result.actionIncomplete);
          console.log('action : ', response.result);

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
            if (response.result.metadata.intentName === 'reminder.add') {
              setReminder(event.user, response.result.parameters);
              // console.log('did it work? ', )
            }
          }
        }
        // console.log(response);
        botResponse.text = response.result.fulfillment.speech;
        // botResponse.thread_ts = event.ts;
        // console.log('time checkin: ', event);
        // console.log("buddy's response: ", botResponse);
        rtm.addOutgoingEvent(response.result.actionIncomplete, 'message', botResponse);

      })


      request.on('error', function (error) {
        console.log(error);
      });

      request.end();
>>>>>>> adddba16533cf6861e427f727b54a9c68ef27d99
  } catch (err) {
    console.error(err);
  }
});

<<<<<<< HEAD
app.post('/send-me-buttons', urlencodedParser, (req, res) => {
  //res.status(200).end();
  let reqBody = req.body;
  let responseURL = reqBody.response_url;
  console.log('inside event')
  if (reqBody.token != process.env.SLACK_MSG_TOKEN) {
    console.log('access forbidden')
    res.status(403).end("Access forbidden");
  } else {
    let message = {
        "text": "This is your first interactive message",
        "attachments": [
            {
                "text": "Building buttons is easy right?",
                "fallback": "Shame... buttons aren't supported in this land",
                "callback_id": "button_tutorial",
                "color": "#3AA3E3",
                "attachment_type": "default",
                "actions": [
                    {
                        "name": "yes",
                        "text": "yes",
                        "type": "button",
                        "value": "yes"
                    },
                    {
                        "name": "no",
                        "text": "no",
                        "type": "button",
                        "value": "no"
                    },
                    {
                        "name": "maybe",
                        "text": "maybe",
                        "type": "button",
                        "value": "maybe",
                        "style": "danger"
                    }
                ]
            }
        ]
    }
    console.log(message)
    res.send(message)
  }
})
/*
* helper function that asks user for authentication
*/
const handleAuth = async (channel) => {
  const response = Object.assign({}, defaultResponse, channel,
  { text: `I need your permission to access google calendar: ${REDIRECT_URL}` });
  return await rtm.addOutgoingEvent(true, 'message', response);
}
=======

>>>>>>> adddba16533cf6861e427f727b54a9c68ef27d99

/*
* listen here
*/
app.listen(3000);
