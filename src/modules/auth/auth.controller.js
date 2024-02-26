import User from "../../../DB/models/user.model.js";
import { status } from "../../common/types/enum.js";
import { asyncHandler } from "../../middlewares/asyncHandler.js";
import jwt from "jsonwebtoken";
import randomstring from "randomstring";
import { sendSMS } from "../../service/otp/sms.js";
import { htmlMail } from "../../service/emails/htmlTemplete.js";
import { sendEmail } from "../../service/emails/sendEmail.js";
import { message } from "../../common/messages/message.js";
import { compare, hash } from "../../utils/HashAndCompare.js";

// @desc Signup
// @route POST  /api/v1/auth/signUp
// @access public
const signUp = asyncHandler(async (req, res, next) => {
  //get data from req
  //check data
  const isExisit = await User.findOne({
    $or: [{ email: req.body.email }, { mobileNumber: req.body.mobileNumber }],
  });
  isExisit && next(new Error(message.user.status409, { cause: 409 }));
  // if not exisit hash pass in user model

  //generate token from email
  const emailToken = jwt.sign(
    { email: req.body.email },
    process.env.JWT_SECRET_KEY
  );
  // create user
  const user = await User.create({
    ...req.body,
    password: hash({ plainTxt: req.body.password }),
  });

  // create confirmatiom link
  const link = `${process.env.BASE_URL}/api/v1/auth/acctivate_account/${emailToken}`;
  // send confirmation link
  await sendEmail({
    to: req.body.email,
    subject: "Acctive your account...",
    html: htmlMail(link),
  });

  // send res
  res.status(201).json({
    message: "sign up successfuly, Now check your email",
    user: user.username,
  });
});
// @desc activeAccount
// @route GET  /api/v1/auth/acctivate_account/:emailToken
// @access public
const activeAccount = asyncHandler(async (req, res) => {
  //find user by emailToken
  const { emailToken } = req.params;
  const { email } = jwt.verify(emailToken, process.env.JWT_SECRET_KEY);
  //update isEmailConfirm
  const user = await User.findOneAndUpdate(
    { email },
    { isEmailConfirm: true },
    { new: true }
  );
  !user && next(new Error(message.user.status404, { cause: 404 }));
  user &&
    res
      .status(200)
      .json({ message: "acctivate your account successfuly", user });
});
// @desc SignIn
// @route POST  /api/v1/auth/login
// @access public
const logIn = asyncHandler(async (req, res, next) => {
  //get data from req
  const { email, mobileNumber, password } = req.body;
  //check data by email mobileNumber
  const user = await User.findOne({
    $or: [{ email }, { mobileNumber }],
  });
  !user && next(new Error(message.user.status404, { cause: 404 }));

  //compare password
  const match = compare({ plainTxt: password, hashTxt: user.password });
  if (!match) {
    next(new Error("Incorrect Password", { cause: 400 }));
  }
  //update the status to online
  user.status = status.online;
  await user.save();
  //generate token
  const token = jwt.sign(
    { email, userId: user._id, role: user.role, mobileNumber },
    process.env.JWT_SECRET_KEY
  );
  //send res
  res.status(200).json({ message: "log in successfuly", Token: token });
});
// @desc update my profile
// @route PUT  /api/v1/auth/update-me
// @access private
const updateMe = asyncHandler(async (req, res, next) => {
  // get data
  const { email, mobileNumber, recoveryEmail, birthDate, lastName, firstName } =
    req.body;
  // check if its owner data or not
  const isExisit = await User.findOne({
    $or: [{ email }, { mobileNumber }],
    _id: { $ne: req.user._id },
  });
  if (isExisit)
    return next(new Error("sorry it is not your email", { cause: 400 }));

  // update data of owner
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { ...req.body },
    { new: true }
  );

  !user && res.status(404).json({ message: message.user.status404 });
  user && res.status(200).json({ message: " updated", user });
});
// @desc delete my profile
// @route DELETE  /api/v1/auth/delete-me
// @access private
const deleteMe = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { isDeleted: true },
    { new: true }
  );
  !user && res.status(404).json({ message: message.user.status404 });
  user && res.status(200).json({ message: "user deleted", user });
});
// @desc get my profile
// @route GET  /api/v1/auth/get-me
// @access private
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById( req.user._id );
  !user && res.status(404).json({ message: message.user.status404 });
  user && res.status(200).json({ message: "result:", user });
});
// @desc get another profile
// @route GET  /api/v1/auth/another-user/:id
// @access private
const anyAccount = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id, {
    projection: { password: 0 }
  })
  !user && res.status(404).json({ message: message.user.status404 });
  user && res.status(200).json({ message: "user profile: ", user });
});
// @desc send code to user's phone
// @route PATCH  /api/v1/auth/forget-Password
// @access private
const forgetPass = asyncHandler(async (req, res, next) => {
  // get mobileNumber from req
  const { mobileNumber } = req.body;
  // check mobileNumber in db
  const user = await User.findOne({ mobileNumber });
  !user && next(new Error(message.user.status404, { cause: 404 }));
  // check isEmailConfirm
  !user.isEmailConfirm &&
    next(new Error("You should acctivate your account first", { cause: 404 }));
  //generate forgetCode
  const forgetCode = randomstring.generate({
    charset: "numeric",
    length: 5,
  });
  //save forgetCode to User model
  user.forgetCode = forgetCode;
  await user.save();
  // send forgetCode (go to api resetPass)
  //generate sms
  const isSent = await sendSMS({
    from: mobileNumber,
    body: `Your forgetCode: ${forgetCode}`,
  });
  if (!isSent)
    next(new Error("something wrong in sending SMS", { cause: 500 }));

  // send res
  res.status(200).json({
    message: "You can Reset your password Now , check your SMS",
    user,
  });
});
// @desc change forget password
// @route PATCH  /api/v1/auth/forget-Password
// @access private
const resetPass = asyncHandler(async (req, res, next) => {
  //get data from req
  let { newPassword, confirmPassword, code } = req.body;
  // check user
  const user = await User.findById(req.user._id);

  if (user.forgetCode !== code)
    return next(new Error("Invalid Code", { cause: 400 }));

  // create new token
  const token = jwt.sign(
    {
      mobileNumber: user.mobileNumber,
      email: user.email,
      userId: user._id,
      role: user.role,
    },
    process.env.JWT_SECRET_KEY
  );
  // hash & update password
  newPassword = hash({ plainTxt: newPassword });
  await User.findByIdAndUpdate(
    req.user._id,
    { password: newPassword, changePassAt: Date.now() },
    { new: true }
  );
  //send res
  res.status(200).json({
    message: "reset your Password successfuly ",
    token,
  });
});
// @desc update password
// @route PATCH  /api/v1/auth/update-Password
// @access private
const updatePass = asyncHandler(async (req, res, next) => {
  //get data from req
  let { newPassword, password, mobileNumber, email } = req.body;
  // check user
  const user = await User.findOne({
    _id: req.user._id,
    $or: [{ email }, { mobileNumber }],
  });
  //compare password
  if (user && compare({ plainTxt: password, hashTxt: user.password })) {
    // create new token
    const token = jwt.sign(
      { mobileNumber, email, userId: user._id, role: user.role },
      process.env.JWT_SECRET_KEY
    );
    // hash & update password
    newPassword = hash({ plainTxt: newPassword });
    await User.findByIdAndUpdate(
      req.user._id,
      { password: newPassword, changePassAt: Date.now() },
      { new: true }
    );
    //send res
    res.status(200).json({
      message: "update your Password successfuly ",
      token,
    });
  }

  next(
    new Error("Incorrect Password or mobileNumber or email..", { cause: 400 })
  );
});
// @desc get all account that has the same recoveryEmail
// @route GET  /api/v1/auth/recoveryEmails
// @access private (Admin only)
const recoveryEmail = asyncHandler(async (req, res, next) => {
  /** 3-ways:
   * 1- get recoveryEmail from body
   * 2- get recoveryEmail from params
   * 3- get recoveryEmail from query by ApiFeature(filter)
   */
  // get recoveryEmail "3"
  const { recoveryEmail } = req.query;
  // check in User model
  const user = await User.find({ recoveryEmail });
  //send res
  res.status(200).json({
    message: "All recoveryEmails",
    user,
  });
});


export {
  signUp,
  activeAccount,
  logIn,
  updatePass,
  forgetPass,
  updateMe,
  deleteMe,
  getMe,
  anyAccount,
  resetPass,
  recoveryEmail,
};
