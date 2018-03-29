/*
* This file is for interacting with google calendar
*/

'use strict';
import { google } from 'googleapis';
import { getUserInfoByID } from './routes';

const OAuth2Client = google.auth.OAuth2;
const keys = require('./client_secret.json').web;
const express = require('express');
const router = new express.Router();
import crypto from 'crypto';

import { User, Reminder, Meeting, Invite } from './models/models';

const CLIENT_ID = keys.client_id;
const CLIENT_SECRET = keys.client_secret;
const REDIRECT_URL = "/oauthcb";

const oauth2Client = new OAuth2Client(CLIENT_ID,
  CLIENT_SECRET, keys.redirect_uris[0]);

/*
* documentation: https://www.npmjs.com/package/googleapis#generating-an-authentication-url
*/
const generateAuthCB = (slackID) => {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline', // will return a refresh token
    scope: 'https://www.googleapis.com/auth/calendar', // can be a space-delimited string or an array of scopes
    redirect_uri: `${keys.redirect_uris[0]}`,
    state: slackID, // state is a query param passed to redirect_uri,
  })
}

/*
*
*/
const hashCal = (gCalAUTH) => {
  const hash = crypto.createHash('md5');
  hash.update(gCalAUTH);
  return hash.digest('hex');
}

/* buffer must be 16 for hex, and key must fit */
const buffers = {
    iv: Buffer.from(process.env.ENCRYPTION_IV, "hex"),
    key: new Buffer(process.env.ENCRYPTION_KEY),
}

const encryptGoogleCalAuth = (tokens) => {
  let text = ""
  try {
    text = JSON.stringify(tokens);
    let cipher = crypto.createCipheriv("aes128", buffers.key, buffers.iv);
    let result = cipher.update(text, "utf8", "hex");
    result += cipher.final("hex");
    return result;
  }catch (err) {
    console.error(err)
    return text;
  }
}

const decryptGoogleCalAuth = (text) => {
  let decipher = crypto.createDecipheriv("aes128", buffers.key, buffers.iv);
  let result = decipher.update(text, "hex");
  result += decipher.final();
  return JSON.parse(result);
}

router.get(REDIRECT_URL, (req, res) => {
  oauth2Client.getToken(req.query.code, (err, token) => {
    if(err) {
      console.error('error in retrieving token: ',err)
      res.status(500).json(err);
    }
    // const encryptTokens = token;
    const encryptTokens = encryptGoogleCalAuth(token);
    User.findOneAndUpdate(
      { slackID: req.query.state },
      { $set: { "googleCalAuth": encryptTokens } },
      { new: true }
    ).then((user) => {
      res.status(200).json(token);
    }).catch((err) => {
      console.error('error in updating user: ',err);
      res.status(500).send(err);
    })
  });
});

// const testEncryption

/*
 TEMPLATE FOR HOW TO GET EVENTS
*/
const getEvents = async (slackID) => {
    let user = await User.findOne({ slackID: slackID }).exec();
    let tokens = decryptGoogleCalAuth(user.googleCalAuth);
    console.log(tokens);
    oauth2Client.setCredentials(tokens);
    const calendar = google.calendar({version: 'v3', auth: oauth2Client})
    console.log(calendar);
    calendar.events.list({
      calendarId: 'primary',
      timeMin: (new Date()).toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime',
    }, (err, data) => {
      if (err) return console.log('The API returned an error: ' + err);
      const events = data.data.items;
      if (events.length) {
        console.log('Upcoming 10 events:');
        console.log(events[1]);
        const temp = events.map((event, i) => {
        const start = event.start.dateTime || event.start.date;
          console.log(`${start} - ${event.summary}`);
          return `${start} - ${event.summary}`;
        });
        // return temp;
      } else {
        console.log('No upcoming events found.');
        // return 'No upcoming events found.';
      }
    })
}

// const getPrimaryID = () => {
//   const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
//   calendar.calendarList.list({}, (err, data) => {
//     if(err){
//       console.log('err: ', err);
//       return;
//     } else {
//       console.log('data from getPrimaryID: ', data.data.items);
//       return;
//     }
//   })
// }

const getAvail = async (slackID) => {
  console.log('in getAvail');
  let user = await User.findOne({ slackID }).exec();
  const tokens = decryptGoogleCalAuth(user.googleCalAuth);
  oauth2Client.setCredentials(tokens);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  calendar.freebusy.query({
    resource: {
      items: [{'id': user.email}],
      timeMin: "2018-03-29T22:00:00.000Z",
      timeMax: "2018-03-29T23:00:00.000Z"
    }
  }, (err, res) => {
    if(err) {
      console.error(err);
      return;
    }
    // console.log(res.data.calendars[user.email])
    if(res.data.calendars){
      console.log(res.data.calendars[user.email]);
      // res.data.calendars[user.email].busy.map((obj) => console.log('busy: ', obj));
      // res.data.calendars[user.email].errors.map((obj) => console.error('err: ', obj));
    } else {
      console.log(res);
    }
  })
}

const setReminder = async (slackID, params) => {
    let { date, subject } = params;
    date = date.replace(/-/g, '/');
    let user = await User.findOne({ slackID }).exec();
    const tokens = decryptGoogleCalAuth(user.googleCalAuth);
    oauth2Client.setCredentials(tokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const event = {
      'summary': subject,
      'start': {
        'date': new Date(date).toLocaleDateString(),
        'timeZone': 'America/Los_Angeles'
      },
      'end': {
        'date': new Date(date).toLocaleDateString(),
        'timeZone': 'America/Los_Angeles'
      }
    }
    // return new Promise((resolve, reject) => {
    calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    }, (err, gEvent) => {
      if(err){
        console.error(err);
      }else{
        console.log('Event created: %s', gEvent.data.htmlLink);
        const newReminder = new Reminder({
          eventID: gEvent.data.id,
          day: date,
          subject,
          userID: user._id
        });
        newReminder.save().then((reminder) =>
          console.log(reminder)
        ).catch((err) => console.error(err));
      }

      // err ? reject(err) : resolve(event.data.status)

      // return !!err || event.data.status;
      // }else{
      //   console.log(event.data)
      // }
    });
  // })
}
//
// const getAvail = async (slackID, start, end) => {
//   try {
//     let user = await User.findOne({ slackID }).exec();
//     const tokens = decryptGoogleCalAuth(user.googleCalAuth);
//     oauth2Client.setCredentials(tokens);
//     const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
//     calendar.freebusy.query({
//       resource: {   //needed to include resource instead of sending the params directly.
//                   timeMin: "2018-03-28T22:00:00.000Z",
//                   timeMax: "2018-03-28T23:00:00.000Z",
//                   'timeZone': 'America/Los_Angeles'
//                 }
//     }, (err, res) => {
//       if(err){
//         console.log('There was an error! ', err);
//         return;
//       }else{
//         console.log(res);
//       }
//     })
//   } catch(err) {
//     console.error('error ', err);
//   }
// }
// const setClient = (slackID) => {
//   let user = await User.findOne({ slackID }).exec();
//   const tokens = decryptGoogleCalAuth(user.googleCalAuth);
//   oauth2Client.setCredentials(tokens);
// }
const createInvite = (inviteeID, eventID, hostID) => {
  const invite = new Invite({
    eventID,
    inviteeID,
    hostID,
    status: 'pending'
  });
  invite.save().catch(err => console.error(err));
}


const createMeeting = async (slackID, params) => {
  const { invitees, day, time, subject, location } = params;
  let date = new Date(day.replace(/-/g, '/'));
  let times = time.split(':');
  date.setHours(times[0]);
  date.setMinutes(times[1]);
  date.setSeconds(times[2]);
  let endDate = new Date(date);
  endDate.setHours(date.getHours() + 1);
  let title = "meeting with ";
  const last = invitees.length;
  // try {
  // let user_info = null;
  let user = null;
  let emails = await Promise.all(invitees.map( async (invitee, index) => {
    invitee = invitee.replace(/[\@\<\>]/g,'');
    user = await User.findOne({ slackID: invitee }).exec();
    if(!user){
      const user_info = await getUserInfoByID(invitee);
      user = await User.findOrCreate(invitee, user_info.email, user_info.name);
    }
    title += index === last ? `and ${user.name}` : `${user.name}, `;
    return { email: user.email };
  }));

  user = await User.findOne({ slackID }).exec();
  oauth2Client.setCredentials(decryptGoogleCalAuth(user.googleCalAuth));
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const event = {
    'summary': subject || title,
    'location': location,
    'start' : {
      'dateTime': date.toISOString(),
      'timeZone': 'America/Los_Angeles'
    },
    'end' : {
      'dateTime': endDate.toISOString(),
      'timeZone': 'America/Los_Angeles'
    },
    'attendees': emails
  }

  calendar.events.insert({
    calendarId: 'primary',
    resource: event
  }, (err, gEvent) => {
    if(err){
      console.error(err);
    }else{
      console.log('Event created: %s', gEvent.data.htmlLink);
      console.log('id: ', gEvent.data.id);
      const newMeeting = new Meeting({
        eventID: gEvent.data.id,
        day,
        subject,
        time: {
          start: date,
          end: endDate,
        },
        status: 'confirmed',
        userID: user._id
      });
      newMeeting.save().then((meeting) =>
        console.log(meeting)
      ).catch((err) => console.error(err));
    }
  })
}



module.exports = {
  googleRoutes: router,
  generateAuthCB: generateAuthCB,
  getEvents: getEvents,
  setReminder: setReminder,
  createMeeting: createMeeting,
  getAvail: getAvail,
};
