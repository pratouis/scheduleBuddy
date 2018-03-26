const { IncomingWebhook, RTMClient, WebClient } = require('@slack/client');
// import SlackBot from 'slackbots';
//
// const bot = new SlackBot({
//   token: process.env.BOT_SLACK_TOKEN,
//   name: 'bubbabuddy'
// });
//
// bot.on('start', function() {
//   var params = {
//        icon_emoji: ':cat:'
//    };
//
//    // define channel, where bot exist. You can adjust it there https://my.slack.com/services
//    bot.postMessageToChannel('schedulebuddy', 'meow!', params);
//
// });

/*
* RTM API to be used to respond to messages ?
*/
const rtm = new RTMClient(process.env.BOT_SLACK_TOKEN);
rtm.start();

/*
* Web API to be used to parse through messages ?
*/
// const web = new WebClient(process.env.SLACK_TOKEN);

/* WEBHOOK needed to communicate with slack server and slack server to our app */
const currentTime = new Date().toTimeString();


rtm.on('message', (event) => {
  // For structure of `event`, see https://api.slack.com/events/reaction_added
  console.log(event);
  rtm.addOutgoingEvent(true, 'message', { text:'hi you', channel: event.channel, reply_broadcast: true }).then((res) => {
    // `res` contains information about the posted message
    console.log('Message sent: ', res.ts);
  })
  .catch(console.error);
});
