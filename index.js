import mongoose from 'mongoose';
const express = require('express');
import { User } from './models/models';
const { RTMClient, WebClient } = require('@slack/client');
import { url, router } from './google';

const app = express();

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
  // let user = await User.findAndModify({
  //   query: { _id: mongoose.Schema.ObjectId(event.user) },
  //   update: {
  //     $setOnInsert: { _id: mongoose.Schema.ObjectId(event.user) }
  //   },
  //   new: true,
  //   upsert: true
  // });
  let user = await User.findOrCreate

  // console.log(event.user);
  // TODO send @param user_msg to dialogflow to get intent/query/whatever
  const user_msg = event.text;
  // TODO query calendar API to see if we have access to modify calendar
  // using email
  const user_email = getUserEmailByID(event.user);
  if(typeof user_email !== "string"){
    console.log('no bueno, got error');
    rtm.addOutgoingEvent(true, 'mess')
  }
  // TODO @backend let's look at associating google calendar oauth with slack acct

  const response = {
    text: 'hi hello',
    channel: event.channel,
    reply_broadcast: true
  }

  rtm.addOutgoingEvent(true, 'message', response)
  .then((success) => {
    // `res` contains information about the posted message
    console.log(success);
    console.log('Message sent: ', success.ts);
  })
  .catch(console.error);
});

/*
* helper function that asks user for authentication
*/
const handleAuth = (channel) => {
  const response = Object.assign({}, defaultResponse, channel,
  { text: 'I need your permission to access google calendar: ' });
  rtm.addOutgoingEvent(true, 'message', response);
}

/*
* listen here
*/
app.listen(3000);
