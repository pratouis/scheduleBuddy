import mongoose from 'mongoose';
const express = require('express');
import { User } from './models/models';
const { RTMClient, WebClient } = require('@slack/client');
import { generateAuthCB, googleRoutes } from './google';
import { getUserEmailByID } from './routes';
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
// const web = new WebClient(process.env.SLACK_TOKEN);

/* WEBHOOK needed to communicate with slack server and slack server to our app */
const currentTime = new Date().toTimeString();

const defaultResponse = {
  reply_broadcast: true
}


// TODO
/*
1) database
2)
*/


rtm.on('message', async (event) => {
  // For structure of `event`, see https://api.slack.com/events/reaction_added
  try {
    const user_email = await getUserEmailByID(event.user);
    if(typeof user_email !== "string") {
      throw `no bueno, user_email is typeof ${typeof user_email}`;
    }
    // TODO @backend let's look at associating google calendar oauth with slack acct
    let user = await User.findOrCreate(event.user, user_email);
    const response = Object.assign({}, defaultResponse, {channel: event.channel});
    if(! user.googleCalAuth) {
      response.text = `I need your permission to access google calendar: ${generateAuthCB(event.user)}`;
      let res = await rtm.addOutgoingEvent(true, 'message', response);
    } else {
      // console.log(event.text);
      console.log(event);
      response.text = 'hi hello';
      let success = await rtm.addOutgoingEvent(true, 'message', response)
      console.log('Message sent: ', success.ts);
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
