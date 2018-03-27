var mongoose = require('mongoose');


var evetSchema = {

}
var Event = mongoose.model("Event", eventSchema);
module.exports={
  Event: Event
};
