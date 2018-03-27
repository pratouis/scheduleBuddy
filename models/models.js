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
    required: true,
    default: ""
  },
  name: {
    type: String
  }
});

userSchema.statics.findOrCreate = function (slackID, email) {
  return this.findOneAndUpdate(
    { slackID: slackID },
    { $setOnInsert: { email: email } },
    { upsert: true, new: true }
  ).exec()
}


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
