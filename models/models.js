import mongoose from 'mongoose';
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
    default: ''
  },
  name: {
    type: String
  }
});


module.exports = {
  User: mongoose.model('User', userSchema)
};

// var evetSchema = {
//
// }
// var Event = mongoose.model("Event", eventSchema);
// module.exports={
//   Event: Event
// };
