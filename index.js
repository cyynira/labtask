const express = require('express');
const bodyParser = require('body-parser');
const app = express();
app.use(bodyParser.json());
let users = [];
let events = [];
let reminderTimers = {};
function generateId() {
  return Math.random().toString(36).substr(2, 9);
}
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).send("Username and password required.");
  if (users.find(u => u.username === username)) return res.status(400).send("User already exists.");
  const user = { id: generateId(), username, password };
  users.push(user);
  res.status(201).send({ message: 'User registered successfully', userId: user.id });
});
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).send("Invalid credentials");
  res.send({ message: 'Login successful', token: user.id });
});
function authMiddleware(req, res, next) {
  const token = req.headers['x-token'];
  if (!token) return res.status(401).send("Authentication required");
  const user = users.find(u => u.id === token);
  if (!user) return res.status(401).send("Invalid token");
  req.user = user;
  next();
}
app.post('/events', authMiddleware, (req, res) => {
  const { name, description, date, time, category, reminderMinutesBefore } = req.body;
  if (!name || !date || !time) return res.status(400).send("Name, date, and time are required.");
  const eventDate = new Date(`${date}T${time}`);
  if (isNaN(eventDate.getTime())) return res.status(400).send("Invalid date or time.");
  const event = {
    id: generateId(),
    userId: req.user.id,
    name,
    description: description || "",
    date: eventDate,
    category: category || "General",
    reminderMinutesBefore: reminderMinutesBefore || null,
    reminderSet: !!reminderMinutesBefore
  };
  events.push(event);
  if (reminderMinutesBefore) {
    const reminderTime = new Date(eventDate.getTime() - reminderMinutesBefore * 60000);
    const now = new Date();
    if (reminderTime > now) {
      const timeout = reminderTime.getTime() - now.getTime();
      const timer = setTimeout(() => {
        console.log(`Reminder: Event "${name}" is coming up at ${eventDate}`);
      }, timeout);
      reminderTimers[event.id] = timer;
    }
  }
  res.status(201).send({ message: "Event created", event });
});
app.get('/events', authMiddleware, (req, res) => {
  let userEvents = events.filter(e => e.userId === req.user.id);
  const now = new Date();
  userEvents = userEvents.filter(e => e.date >= now);
  const sortBy = req.query.sortBy;
  if (sortBy === 'date') {
    userEvents.sort((a, b) => a.date - b.date);
  } else if (sortBy === 'category') {
    userEvents.sort((a, b) => a.category.localeCompare(b.category));
  } else if (sortBy === 'reminder') {
    userEvents.sort((a, b) => (a.reminderSet === b.reminderSet) ? 0 : a.reminderSet ? -1 : 1);
  }
  res.send(userEvents);
});
app.get('/', (req, res) => {
  res.send("Event Planning and Reminder System");
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
if (process.argv[2] === 'test') {
  const assert = require('assert');
  const request = require('supertest');
  (async () => {
    users = [];
    events = [];
    console.log("Running tests...");
    let res = await request(app)
      .post('/register')
      .send({ username: "testuser", password: "testpass" });
    assert.strictEqual(users.length, 1, "User registration failed");
    res = await request(app)
      .post('/login')
      .send({ username: "testuser", password: "testpass" });
    const token = res.body.token;
    assert.ok(token, "User login failed");
    const eventData = {
      name: "Meeting",
      description: "Team meeting",
      date: "2099-12-31",
      time: "10:00",
      category: "Meetings",
      reminderMinutesBefore: 30
    };
    res = await request(app)
      .post('/events')
      .set("x-token", token)
      .send(eventData);
    assert.strictEqual(res.body.message, "Event created", "Event creation failed");
    res = await request(app)
      .get('/events')
      .set("x-token", token)
      .query({ sortBy: 'date' });
    assert.ok(Array.isArray(res.body) && res.body.length === 1, "View events failed");
    console.log("All tests passed!");
    process.exit(0);
  })();
}
