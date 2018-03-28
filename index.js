import mongoose from 'mongoose';
import { User } from './models/models';
const { RTMClient, WebClient } = require('@slack/client');
import { generateAuthCB, googleRoutes, getEvents } from './google';
import { getUserEmailByID } from './routes';

import express from 'express';
import axios from 'axios';
import bodyParser from 'body-parser';
const app = express();
const urlencodedParser = bodyParser.urlencoded({ extended: false });
//app.use('/', googleRoutes);

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
// TODO: @Chris or @Trevor use this package to integrate with APIAI
// const apiai = require('apiai');
// const app = apiai(process.env.APIAI_CLIENT_TOKEN);
// console.log(rtm.users);
/*
* Web API to be used to parse through messages ?
*/
// const web = new WebClient(process.env.SLACK_TOKEN);

/* WEBHOOK needed to communicate with slack server and slack server to our app */
const currentTime = new Date().toTimeString();

const defaultResponse = {
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
}


// TODO
/*
1) database
2)
*/


rtm.on('message', async (event) => {
  // For structure of `event`, see https://api.slack.com/events/reaction_added
  try {
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
  } catch (err) {
    console.error(err);
  }
  // console.log(event.user);
  // TODO send @param user_msg to dialogflow to get intent/query/whatever
  // const user_msg = event.text;
  // TODO query calendar API to see if we have access to modify calendar
  // using email
});

app.post('/slack/slash-commands/send-me-buttons', urlencodedParser, (req, res) => {
  res.status(200).end();
  let reqBody = req.body;
  let responseURL = reqBody.response_url;

  if (reqBody.token != process.env.SLACK_TOKEN) {
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
    sendMessageToSlackResponseURL(responseURL, message);
  }
})

app.post('/slack/actions', urlencodedParser, (req, res) =>{
    res.status(200).end() // best practice to respond with 200 status
    var actionJSONPayload = JSON.parse(req.body.payload) // parse URL-encoded payload JSON string
    var message = {
        "text": actionJSONPayload.user.name+" clicked: "+actionJSONPayload.actions[0].name,
        "replace_original": false
    }
    sendMessageToSlackResponseURL(actionJSONPayload.response_url, message)
})

function sendMessageToSlackResponseURL(responseURL, JSONmessage){
    var postOptions = {
        uri: responseURL,
        method: 'POST',
        headers: {
            'Content-type': 'application/json'
        },
        json: JSONmessage
    }
    request(postOptions, (error, response, body) => {
        if (error){
            // handle errors as you see fit
        }
    })
}
/*
* helper function that asks user for authentication
*/
const handleAuth = async (channel) => {
  const response = Object.assign({}, defaultResponse, channel,
  { text: `I need your permission to access google calendar: ${REDIRECT_URL}` });
  return await rtm.addOutgoingEvent(true, 'message', response);
}

/*
* listen here
*/
app.listen(3000);
