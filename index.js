const { IncomingWebhook, RTMClient, WebClient } = require('@slack/client');

/*
* RTM API to be used to respond to messages ?
*/
const rtm = new RTMClient(process.env.BOT_SLACK_TOKEN);
rtm.start();

/*
* Web API to be used to parse through messages ?
*/
const web = new WebClient(process.env.SLACK_TOKEN);

/* WEBHOOK needed to communicate with slack server and slack server to our app */
const webhook = new IncomingWebhook(process.env.SLACK_WEBHOOK_URL);
const currentTime = new Date().toTimeString();


webhook.send(`The current time is ${currentTime}`, (error, resp) => {
  if (error) {
    return console.error(error);
  }
  console.log('Notification sent');
  console.log('Waiting a few seconds for search indexes to update...');
  setTimeout(() => {
    console.log('Calling search.messages');
    web.search.messages({ query: currentTime })
      .then(resp => {
        console.log(resp);
        if (resp.messages.total > 0) {
          console.log('First match:', resp.messages.matches[0]);
        } else {
          console.log('No matches found');
        }
      })
      .catch(console.error)
  }, 12000);
});
