# scheduleBuddy

## What kind of slack bot? 
We created a bot user through a combination of Slack's API and Google's dialogFlow that is able to understand user's requests to create reminders and meetings, as well as banter.  The bot asks a user to grant access (read and write) to their google calendar, under the assumption that the user joined the slack workspace with a google account.  

---
## What APIs 

#### [Slack API](https://api.slack.com/)
We used three parts of slack's API to produce this bot, and used the following scopes
+ bot
+ chat:write:bot
+ chat:write:user
+ users:read
+ users:read.email

##### [Real Time Messaging (RTM) API](https://api.slack.com/rtm) 
The RTM sets up a message server WebSocket with Slack.
The RTMClient served as an event-listener for all events of type 'message' within the bot's scope.

##### [Web API Client](http://slackapi.github.io/node-slack-sdk/web_api)
The Web API Client handles request queueing, and allowed for us to send reponses synchronously.  

##### [Interactive Messages](https://api.slack.com/interactive-messages)
In order to ask for user's confirmation of a reminder or meeting, or to resolve a conflict, we crafted attachment objects which were formatted as interactive components by Slack.  The attachments had to include all information necessary to create an event after a user's confirmation, because Slack routes users responses to a post endpoint (of the developer's choosing).    
#### [dialogFlow](https://dialogflow.com/)
Through repeated sentences and phrases, our team trained a dialogFlow for adding reminders and adding meetings, detecting slack users with slack ID syntax `<@U123456>`.

#### [Google Calendar API](https://developers.google.com/calendar/overview)
Using the npm package [googleapis](https://www.npmjs.com/package/googleapis) to handle oauth requests and credentials, we were able to insert and get events with limited pinging of Google's Calendar API.   

---
## What were some challenges?
+ Coordinating between all of Slack's APIs and keeping requests to Google Calendar low.  

## What's left to-do? 
+ deploy to heroku - currently using ngrok 
+ send invites to individual users mentioned in meetings 
+ change confirm-cancel buttons to check mark or x mark with text (see interactive messages) 
+ deploy to slack, get feedback
