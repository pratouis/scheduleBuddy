import mongoose from 'mongoose';
const express = require('express');
import { User } from './models/models';
const { RTMClient, WebClient } = require('@slack/client');
import { generateAuthCB, googleRoutes, getEvents, setReminder, getAvail } from './google';
import { getUserEmailByID } from './routes';
import axios from 'axios';
const app = express();
app.use('/', googleRoutes);

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
// TODO: @Chris or @Trevor use this package to integrate with APIAI
// const apiai = require('apiai');
// const app = apiai(process.env.APIAI_CLIENT_TOKEN);
// console.log(rtm.users);
/*
* Web API to be used to parse through messages ?
*/
const web = new WebClient(process.env.SLACK_TOKEN);

/* WEBHOOK needed to communicate with slack server and slack server to our app */
const currentTime = new Date().toTimeString();

const defaultResponse = {
  reply_broadcast: true,
  subtype: 'bot_message',
}


// TODO
/*
1) database
2)
*/


rtm.on('message', async (event) => {
  // For structure of `event`, see https://api.slack.com/events/reaction_added
  let { message } = event;
  if(!message){ message = event; }
  if(message !== event) console.log('message: ', message);
  if ((message.subtype && message.subtype === 'bot_message') ||
       (!message.subtype && message.user === rtm.activeUserId) ) {
    return;
  }

  try {
    const user_email = await getUserEmailByID(event.user);
    if(typeof user_email !== "string") {
      throw `invalid email: type is ${typeof user_email}`;
    }
    let user = await User.findOrCreate(event.user, user_email);
    const response = Object.assign({}, defaultResponse, {channel: event.channel});
    if(!user.googleCalAuth)
    {
      response.text = `I need your permission to access google calendar: ${generateAuthCB(event.user)}`;
      let res = rtm.addOutgoingEvent(false, 'message', response);
      // let res = await web.chat.postMessage({ channel: event.channel, text: response.text, subtype: 'bot_message' })
      // console.log('auth request sent in ', res.ts);
    } else {
      // response.text = 'hi hello';
      // getEvents(event.user);
      // setReminder(event.user, 'testing reminders', new Date().toString());
      getAvail(event.user, null, null);
      // let success = await rtm.addOutgoingEvent(true, 'message', response)
      // let success = await web.chat.postMessage({ channel: event.channel, text: response.text, subtype: 'bot_message' })
      // console.log('Message sent: ', success.ts);
    }
  } catch (err) {
    console.error(err);
  }
  // console.log(event.user);
  // TODO send @param user_msg to dialogflow to get intent/query/whatever
  // const user_msg = event.text;
  // TODO query calendar API to see if we have access to modify calendar
  // using email
});



/*
* listen here
*/
app.listen(3000);
