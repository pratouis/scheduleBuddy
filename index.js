const { IncomingWebhook, RTMClient, WebClient } = require('@slack/client');

/*
* RTM API to be used to respond to messages ?
*/
const rtm = new RTMClient(process.env.BOT_SLACK_TOKEN);
rtm.start();
// TODO: @Chris or @Trevor use this package to integrate with APIAI
// const apiai = require('apiai');
// const app = apiai(process.env.APIAI_CLIENT_TOKEN);

/*
* Web API to be used to parse through messages ?
*/
// const web = new WebClient(process.env.SLACK_TOKEN);

/* WEBHOOK needed to communicate with slack server and slack server to our app */
const currentTime = new Date().toTimeString();

rtm.on('hello', (event) => {
  console.log(event.type);
});

rtm.on('presence_change', (event) => {
    console.log(event);
})

rtm.on('message', (event) => {
  // For structure of `event`, see https://api.slack.com/events/reaction_added
  console.log(event);
  rtm.addOutgoingEvent(true, 'message', { text:'hi you', channel: event.channel, reply_broadcast: true }).then((res) => {
    // `res` contains information about the posted message
    console.log('Message sent: ', res.ts);
  })
  .catch(console.error);
});
