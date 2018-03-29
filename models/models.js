import mongoose from 'mongoose';
import { getUserEmailByID } from '../routes';
const userSchema = mongoose.Schema({
  email: {
    type: String,
    trim: true,
    required: true,
  },
  slackID: {
    type: String,
    required: true,
    unique: true,
  },
  googleCalAuth: {
    type: String,
    required: true,
    default: ""
  },
  name: {
    type: String
  }
});

userSchema.statics.findOrCreate =  function (slackID, email) {
  return this.findOneAndUpdate(
    { slackID: slackID },
    { $setOnInsert: { email: email } },
    { upsert: true, new: true }
  ).exec()
}

const reminderSchema = mongoose.Schema({
  eventID: {
    type: String,
    required: true,
    default: 'foo',
  },
  subject: {
    type: String,
    required: true
  },
  day: {
    type: Date,
    required: true
  },
  userID : {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
});


const meetingSchema = mongoose.Schema({
  eventID: {
    type: String,
    required: true,
    default: 'foo',
  },
  subject: {
    type: String,
    default: ''
  },
  day: {
    type: Date,
    required: true,
  },
  time: {
    start : {
      type: Date,
      required: true,
    },
    end : {
      type: Date,
      required: true,
    }
  },
  invitees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true}],
  status: String,
  userID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
})

module.exports = {
  User: mongoose.model('User', userSchema),
  Reminder: mongoose.model('Reminder', reminderSchema),
  Meeting: mongoose.model('Meeting', meetingSchema)
};

// var evetSchema = {
//
// }
// var Event = mongoose.model("Event", eventSchema);
// module.exports={
//   Event: Event
// };
