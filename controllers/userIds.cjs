const User = require("../model/userModel.cjs");
const bcrypt = require("bcrypt");

module.exports.userData = async (req, res, next) => {
    try {
        var userId = req.params.id;
        console.log(userId);
        return userId;
    } catch (ex) {
        next(ex);
    }
};