/*
* This file is for interacting with google calendar
*/
'use strict';
import { google } from 'googleapis';
import { getUserInfoByID } from './routes';
import _ from 'underscore';

const OAuth2Client = google.auth.OAuth2;
const keys = require('./client_secret.json').web;
const express = require('express');
const router = new express.Router();
import crypto from 'crypto';

import { User, Reminder, Meeting, Invite } from './models/models';

const calendar = google.calendar({ version: 'v3'});
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

const getAvail = async (user, startDate, endDate) => {
  return new Promise( (resolve, reject) => {
      oauth2Client.setCredentials(decryptGoogleCalAuth(user.googleCalAuth));
      // const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      console.log(startDate.toString(), endDate.toString());
      calendar.freebusy.query({
        auth: oauth2Client,
        resource: {
          items: [{'id': user.email}],
          timeMin: startDate,
          timeMax: endDate,
         'timeZone': 'America/Los_Angeles',
        }
      }, (err, res) => {
        if(err){
          console.error(err);
          reject(err);
        }else {
          console.log(res.data.calendars[user.email]);
          resolve(!!!res.data.calendars[user.email].busy.length);
        }
      })
  });
}

const setReminder = async (slackID, params) => {
      try {
        let date = new Date(params[0].replace(/-/g, '/'));
        let user = await User.findOne({ slackID }).exec();
        oauth2Client.setCredentials(decryptGoogleCalAuth(user.googleCalAuth));
        const event = {
          'summary': params[1],
          'start': {
            'date': date.toLocaleDateString(),
            'timeZone': 'America/Los_Angeles'
          },
          'end': {
            'date': date.toLocaleDateString(),
            'timeZone': 'America/Los_Angeles'
          }
        };
        return new Promise((resolve, reject) =>{
          calendar.events.insert({
            auth: oauth2Client,
            calendarId: 'primary',
            resource: event,
          }, (err, gEvent) => {
            if(err) {
              reject(err);
            } else {
              const newReminder = new Reminder({
                eventID: gEvent.data.id,
                day: date.toISOString(),
                subject: params[1],
                userID: user._id
              });
              newReminder.save()
              .then((rem) => resolve({ success: true }))
              .catch(err => reject(err));
            }
          });
        })
      } catch(err) {
        console.error(err);
      }
}

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


const createMeeting = async (params) => {
    try {
      let { slackID, invitees, startDate, endDate } = params;
      startDate = new Date(startDate);
      endDate = new Date(endDate);
      let user = await User.findOne({ slackID }).exec();
      // oauth2Client.setCredentials(decryptGoogleCalAuth(user.googleCalAuth));
      let availability = await getAvail(user, startDate, endDate);
      if(!availability) {
        return new Promise((resolve, request) => {
          reject({availability: availability});
        })
      }
      let userIDs = [];
      let title = "meeting with ";
      let emails = await Promise.all(invitees.map( async (invitee, index) => {
        invitee = invitee.replace(/[\@\<\>]/g,'');
        let _user = await User.findOne({ slackID: invitee }).exec();
        if(!_user){
          const user_info = await getUserInfoByID(invitee);
          _user = await User.findOrCreate(invitee, user_info.email, user_info.name);
        }
        userIDs.push(_user._id);
        title += index === invitees.length ? `and ${_user.name}` : `${_user.name}, `;
        return { email: _user.email };
      }));

      if(!emails){
        throw `no emails found! invitees: ${invitees.toString()}`;
      }

      const event = {
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
      };

      return new Promise((resolve, reject) => {
        calendar.events.insert({
          auth: oauth2Client,
          calendarId: 'primary',
          resource: event
        }, (err, gEvent) => {
          if(err) {
            reject(err);
          } else {
            console.log('calendar created in google');
            const newMeeting = new Meeting({
              eventID: gEvent.data.id,
              // day: ,
              subject: title,
              time: {
                start: startDate,
                end: endDate,
              },
              status: 'confirmed',
              userID: user._id,
              invitees: userIDs
            });
            newMeeting.save()
            .then((meeting) => {
              console.log('calendar created in mongodb');
              resolve({ invitees: userIDs,
                hostID: user._id,
                eventID: gEvent.data.id,
                meetingID: meeting._id,
                eventLink: gEvent.data.htmlLink,
              });
            })
            .catch(err => {
              console.log('error in mongodb: ', err);
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
