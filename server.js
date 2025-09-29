const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Database setup
const db = new sqlite3.Database('tasks.db');

// Initialize database tables
db.serialize(() => {
  // Tasks table
  db.run(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    completed BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Task logs table
  db.run(`CREATE TABLE IF NOT EXISTS task_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    tasks_data TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// API Routes

// Get all tasks
app.get('/api/tasks', (req, res) => {
  db.all('SELECT * FROM tasks ORDER BY created_at ASC', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Add a new task
app.post('/api/tasks', (req, res) => {
  const { text } = req.body;
  
  if (!text || text.trim() === '') {
    res.status(400).json({ error: 'Task text is required' });
    return;
  }

  db.run('INSERT INTO tasks (text) VALUES (?)', [text.trim()], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ id: this.lastID, text: text.trim(), completed: false });
  });
});

// Toggle task completion
app.put('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const { completed } = req.body;

  db.run('UPDATE tasks SET completed = ? WHERE id = ?', [completed ? 1 : 0, id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.json({ success: true });
  });
});

// Delete a task
app.delete('/api/tasks/:id', (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM tasks WHERE id = ?', [id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.json({ success: true });
  });
});

// Get task logs
app.get('/api/logs', (req, res) => {
  db.all('SELECT * FROM task_logs ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Clear all tasks (for daily reset)
app.delete('/api/tasks', (req, res) => {
  db.run('DELETE FROM tasks', function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true, deleted: this.changes });
  });
});

// Save tasks to log
app.post('/api/logs', (req, res) => {
  const { date, tasks } = req.body;
  
  if (!date || !tasks) {
    res.status(400).json({ error: 'Date and tasks are required' });
    return;
  }

  const tasksData = JSON.stringify(tasks);
  
  db.run('INSERT INTO task_logs (date, tasks_data) VALUES (?, ?)', [date, tasksData], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true, id: this.lastID });
  });
});

// Daily reset and logging functions
function saveTasksToLog() {
  db.all('SELECT * FROM tasks', (err, tasks) => {
    if (err) {
      console.error('Error fetching tasks for logging:', err);
      return;
    }
    
    if (tasks.length > 0) {
      const today = new Date().toDateString();
      const tasksData = JSON.stringify(tasks);
      
      db.run('INSERT INTO task_logs (date, tasks_data) VALUES (?, ?)', [today, tasksData], function(err) {
        if (err) {
          console.error('Error saving tasks to log:', err);
        } else {
          console.log(`Saved ${tasks.length} tasks to log for ${today}`);
        }
      });
    }
  });
}

function resetTasks() {
  db.run('DELETE FROM tasks', function(err) {
    if (err) {
      console.error('Error resetting tasks:', err);
    } else {
      console.log(`Reset completed. Deleted ${this.changes} tasks.`);
    }
  });
}

// Schedule daily tasks
// Save tasks at 23:59 every day
cron.schedule('59 23 * * *', () => {
  console.log('Running daily task save at 23:59...');
  saveTasksToLog();
});

// Reset tasks at 00:00 every day
cron.schedule('0 0 * * *', () => {
  console.log('Running daily task reset at 00:00...');
  resetTasks();
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Daily reset scheduled for 00:00');
  console.log('Daily logging scheduled for 23:59');
});
