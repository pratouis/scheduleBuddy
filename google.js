/*
* This file is for interacting with google calendar
*/
'use strict';
import { google } from 'googleapis';
import { getUserInfoByID } from './routes';
import _ from 'underscore';
import { User, Reminder, Meeting, Invite } from './models/models';
import { encryptGoogleCalAuth, decryptGoogleCalAuth } from './security';
const express = require('express');
const router = new express.Router();

const keys = require('./client_secret.json').web;
const CLIENT_ID = keys.client_id;
const CLIENT_SECRET = keys.client_secret;
const REDIRECT_URL = "/oauthcb";

const calendar = google.calendar({ version: 'v3'});
const OAuth2Client = google.auth.OAuth2;
const oauth2Client = new OAuth2Client(CLIENT_ID,CLIENT_SECRET, keys.redirect_uris[0]);

/* generates authentication URL for a user to grant schedulerbuddy permission
*     to access and write to the user's calendar
*     @param slackID - sets query param state of redirect URL
*     return: URL
*
*     documentation: https://www.npmjs.com/package/googleapis#generating-an-authentication-url
*/
const generateAuthCB = (slackID) => {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline', // will return a refresh token
    scope: 'https://www.googleapis.com/auth/calendar', // can be a space-delimited string or an array of scopes
    redirect_uri: `${keys.redirect_uris[0]}`,
    state: slackID, // state is a query param passed to redirect_uri,
  })
}
/************************************************************/
/* google calendar authorization callback
*   purpose: endpoint for Google to send authorization tokens
*            store encrypted tokens in mongoDB associated with user
*   @req.query.code: authorization code to request tokens from google
*   @req.query.state: slackID of user who's granting permission to access their calendar
*
*   helper functions: encryptGoogleCalAuth - encryption of tokens
*
*   respond with 401 if google sends us an error;
*   respond with 500 if we are unable to save user to DB
*   respond with 200 upon successfully receiving tokens and updating mongoDB
*/
router.get(REDIRECT_URL, (req, res) => {
  oauth2Client.getToken(req.query.code, (err, tokens) => {
    if(err) {
      console.error('error in retrieving tokens: ',err)
      res.status(401).json(err);
      return;
    }
    User.findOneAndUpdate(
      { slackID: req.query.state },
      { $set: { "googleCalAuth": encryptGoogleCalAuth(tokens) } },
      { new: true }
    ).then((user) => {
      res.status(200).send('Thanks for allowing schedulerBuddy to access your calendar\nGo back to Slack to schedule meetings and reminders');
    }).catch((err) => {
      console.error('error in updating user: ',err);
      res.status(500).send(err);
    })
  });
});



/*
 TEMPLATE FOR HOW TO GET EVENTS
*/
const getEvents = async (slackID, startDate) => {
    const MIN_HR = 7;
    const MAX_HR = 23;
    const daysOfTheWeek = [
      'Sun',
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
    ];
    let user = await User.findOne({ slackID }).exec();
    oauth2Client.setCredentials(decryptGoogleCalAuth(user.googleCalAuth));

    const month = startDate.getMonth() + 1;
    const day = startDate.getDate();
    // const year = startDate.getFullYear();
    const dayOfWeek = daysOfTheWeek[startDate.getDay()];
    // const calendar = google.calendar({version: 'v3', auth: oauth2Client})
    return new Promise((resolve, reject) => {
      calendar.events.list({
        auth: oauth2Client,
        calendarId: 'primary',
        timeMin: new Date(startDate.setHours(MIN_HR)).toISOString(),
        timeMax: new Date(startDate.setHours(MAX_HR)).toISOString(),
      }, (err, data) => {
        if (err) {
          console.log('The API returned an error: ' + err);
          reject(err)
        }
        const events = data.data.items;
        if (events.length) {
          const conflictHrs = events.map(event => new Date(event.start.dateTime).getHours());
          console.log('conflicting hours: ',conflictHrs);
          const filteredHrs = _.range(MIN_HR,MAX_HR).filter(hr => !conflictHrs.includes(hr));

          console.log(filteredHrs.map(hr => new Date(new Date(startDate).setHours(hr)).toLocaleString()));
          resolve(filteredHrs.map(hr => new Date(new Date(startDate).setHours(hr)).toLocaleString()));
        } else {
          console.log('No upcoming events found.');
        }
      })

    })
}


/* getAvail - returns promise based on whether user has conflicts with datetime
*     @param user - mongoDB user object
*     @param startDate - start of event
*     @param endDate - end of event
*
*     returns Promise
*        - rejects if error from freebusy
*        - resolves with boolean based on response from freebusy.query
*     helper functions: decryptGoogleCalAuth
*     uses global variables oauth2Client and calendar
*/

// TODO: change getAvail to a better name across entire project
const getAvail = (user, startDate, endDate) => {
  return new Promise( (resolve, reject) => {
      // set credentials using decrypted user tokens
      oauth2Client.setCredentials(decryptGoogleCalAuth(user.googleCalAuth));
      /* though freebusy is poorly documented (https://developers.google.com/calendar/v3/reference/freebusy)
      *   it can be used to determine if a user has an event scheduled during
      *   a specified time interval.
      */
      calendar.freebusy.query({
        // use oauth2Client for authentication, and send object with calendarID,
        //      time interval and timezone
        // see query structure at https://developers.google.com/calendar/v3/reference/freebusy/query
        auth: oauth2Client,
        resource: {
          items: [{'id': user.email}],
          timeMin: startDate,
          timeMax: endDate,
         'timeZone': 'America/Los_Angeles',
        }
      }, (err, res) => {
        if(err){
          console.error('error in freebusy.query: ',err);
          reject(err);
        }else {
          // return true if the length of the busy object is 0, false otherwise
          resolve(!!!res.data.calendars[user.email].busy.length);
        }
      })
  });
}

/* setReminder - creates reminder on google calendar and in mongoDB
*   @params slackID - ID associated with slack user who is creating reminder
*   @params payload - parameters returned from dialogFlow
*
*   returns Promise
*     - rejects with err if
*           - unable to find user by slackID
*           - unsuccessful save to google calendar
*           - unsuccessful save to mongodb
*     - resolves if succesfully saves to google calendar and mongodb
*/
const setReminder = async (slackID, payload) => {
      try {
        // format date to proper JS Date object syntax
        let date = new Date(payload[1].replace(/-/g, '/'));
        // find user using slackID
        let user = await User.findOne({ slackID }).exec();
        // throw an error if user is not found
        if(!user) throw 'no user found in mongoDB';
        // set credentials for oauth2Client connection using user's decrypted credentials
        oauth2Client.setCredentials(decryptGoogleCalAuth(user.googleCalAuth));
        // rename second parameter for readability
        let task = payload[0];

        return new Promise((resolve, reject) => {
          // insert event into main (primary) calendar with authentication credentials,
          // resource is the event structure
          // see event structure at https://developers.google.com/calendar/v3/reference/events
          calendar.events.insert({
            auth: oauth2Client,
            calendarId: 'primary',
            resource: {
              'summary': task,
              'start': {
                'date': date.toLocaleDateString(),
                'timeZone': 'America/Los_Angeles'
              },
              'end': {
                'date': date.toLocaleDateString(),
                'timeZone': 'America/Los_Angeles'
              }
            },
          }, (err, gEvent) => {
            if(err) {
              reject(err);
            } else {
              // create reminder document with eventID matching the ID returned from google
              const newReminder = new Reminder({
                eventID: gEvent.data.id,
                day: date.toISOString(),
                subject: task,
                userID: user._id
              });
              newReminder.save()
              .then((rem) => resolve({ success: true }))
              .catch(err => console.log(err));
            }
          });
        })
      } catch(err) {
        console.error(err);
        return new Promise ((resolve, reject) => reject(err));
      }
}


const createInvite = (inviteeID, eventID, hostID) => {
  const invite = new Invite({
    eventID,
    inviteeID,
    hostID,
    status: 'pending'
  });
  invite.save().catch(err => console.error(err));
}


/*  createMeeting - creates a meeting on google calendar and in mongoDB
*   @params payload - object passed from interactive message including meeting details
*
*   returns promise
*       - rejects with error if
*           - user no longer available
*           - no emails associated with slack accounts
*           - unsuccessful save in google calendar
*           - unsuccessful save in mongoDB
*       - resolves with saved meeting details if successful saves in google calendar and mongoDB
*/
const createMeeting = async (payload) => {
    try {
      // destructure payload
      /* slackID - ID associated with slack user
      * invitees - array of slack IDs to be invited
      * startDate - start date string of meeting
      * endDate - end date string of meeting
      */
      let { slackID, invitees, startDate, endDate } = payload;
      // convert startDate and endDate to date objects
      startDate = new Date(startDate);
      endDate = new Date(endDate);
      // find user in mongoDB by slackID
      let user = await User.findOne({ slackID }).exec();
      // throw error if user not found in DB
      if(!user) throw 'no user found in mongoDB';
      // Note: availablity sets credentials of global variable oauth2Client
      //    so we do not need to do so here.  This is a poor security feature
      let availability = await getAvail(user, startDate, endDate);
      if(!availability) throw `user <@${slackID}> not available as of ${new Date(Date.now()).toLocaleString()}`;
      // Note: for future, storing mongoDB userIDs to send invites out to each user
      let userIDs = [];
      // NOTE: to be changed in future
      // crafting title since AI is inconsistent with getting subject
      let title = `meeting hosted by ${user.name} with `;
      // getting emails, names, and mongoDB userID of each slack user
      let emails = await Promise.all(invitees.map( async (invitee, index) => {
        // get user using slackID
        let _user = await User.findOne({ slackID: invitee }).exec();
        if(!_user){
          // if user doesn't exist, create user in mongodB
          //    using information fetched from slack's API
          const user_info = await getUserInfoByID(invitee);
          _user = await User.findOrCreate(invitee, user_info.email, user_info.name);
        }
        // push mongoDB ID into userID array
        userIDs.push(_user._id);
        // concat user's name with title
        title += index === invitees.length ? `and ${_user.name}` : `${_user.name}, `;
        // return object with key 'email' and value of user.email as required
        //    by google calendar API events https://developers.google.com/calendar/v3/reference/events
        return { email: _user.email };
      }));

      // throw an error if no emails found from invitees slackIDs
      if(!emails) throw `no emails found! invitees: ${invitees.toString()}`;


      return new Promise((resolve, reject) => {
        // insert event into main (primary) calendar with authentication credentials,
        // resource is the event structure
        // see event structure at https://developers.google.com/calendar/v3/reference/events
        calendar.events.insert({
          auth: oauth2Client,
          calendarId: 'primary',
          resource: {
            'summary': title,
            'start' : {
              'dateTime': startDate.toISOString(),
              'timeZone': 'America/Los_Angeles'
            },
            'end' : {
              'dateTime': endDate.toISOString(),
              'timeZone': 'America/Los_Angeles'
            },
            'attendees': emails
          }
        }, (err, gEvent) => {
          if(err) {
            reject(err);
          } else {
            // create meeting model with eventID matching event returned from google
            const newMeeting = new Meeting({
              eventID: gEvent.data.id,
              subject: title,
              time: {
                start: startDate,
                end: endDate,
              },
              status: 'confirmed',
              userID: user._id,
              invitees: userIDs
            });
            // save meeting in MONGODB
            newMeeting.save()
            .then((meeting) => {
              // Note: for future use, returning this information to send out
              //        invites and confirmations to invitees
              resolve({ invitees: userIDs,
                hostID: user._id,
                eventID: gEvent.data.id,
                meetingID: meeting._id,
                eventLink: gEvent.data.htmlLink,
              });
            })
            .catch(err => {
              console.error('error in mongodb: ', err);
              reject(err)
            });
          }
        })

      })
    } catch(err) {
      console.error(err);
      return new Promise( (resolove, reject) => reject(err));
    }
}



module.exports = {
  googleRoutes: router,
  generateAuthCB: generateAuthCB,
  getEvents: getEvents,
  setReminder: setReminder,
  createMeeting: createMeeting,
  getAvail: getAvail,
};
