// import { createRequire } from "module";
// const require = createRequire(import.meta.url);
const { register } = require("../controllers/usersController.cjs");
const { login } = require("../controllers/usersController.cjs");
 
const router = require("express").Router();

router.post("/register", register);
router.post("/login", login);

module.exports = router;