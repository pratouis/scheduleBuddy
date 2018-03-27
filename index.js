const { RTMClient, WebClient } = require('@slack/client');
import axios from 'axios';
/*
* RTM API to be used to respond to messages ?
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



rtm.on('message', (event) => {
  // For structure of `event`, see https://api.slack.com/events/reaction_added
  console.log(event);
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
    text: 'hi you',
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

const getUserEmailByID = (userID) => {
  return axios.get(`https://slack.com/api/users.info?token=${process.env.SLACK_TOKEN}&user=${userID}`)
  .then(({data}) => data.user.profile.email)
  .catch((err) => err);
}
