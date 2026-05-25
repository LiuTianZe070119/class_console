const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');
const app = express();
const port = 3000;

// 中间件
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// 初始化数据库
const db = new sqlite3.Database('./database.db');

// 创建表结构
db.serialize(() => {
  // 用户表
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    real_name TEXT NOT NULL,
    role TEXT DEFAULT 'student',
    position TEXT
  )`);

  // 意见箱主表
  db.run(`CREATE TABLE IF NOT EXISTS opinions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    target_role TEXT NOT NULL,
    is_anonymous INTEGER DEFAULT 0,
    author_id INTEGER NOT NULL,
    author_name TEXT,
    status TEXT DEFAULT 'open',
    assigned_to TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    heat INTEGER DEFAULT 0,
    FOREIGN KEY (author_id) REFERENCES users(id)
  )`);

  // 回复/追问表 (聊天形式)
  db.run(`CREATE TABLE IF NOT EXISTS replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    opinion_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    user_name TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (opinion_id) REFERENCES opinions(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // 点赞表
  db.run(`CREATE TABLE IF NOT EXISTS likes (
    opinion_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    PRIMARY KEY (opinion_id, user_id),
    FOREIGN KEY (opinion_id) REFERENCES opinions(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // 评分表
  db.run(`CREATE TABLE IF NOT EXISTS ratings (
    opinion_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    score INTEGER NOT NULL CHECK(score >=1 AND score <=5),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (opinion_id, user_id),
    FOREIGN KEY (opinion_id) REFERENCES opinions(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // 插入默认用户 (如果不存在)
  const defaultUsers = [
    { username: 'liutianze', password: '123456', real_name: '刘天择', role: 'admin', position: '团支书' },
    { username: 'test', password: '123456', real_name: '测试', role: 'student', position: null },
    { username: 'wangwu', password: '123456', real_name: '王五', role: 'student', position: null },
    { username: 'admin', password: 'admin123', real_name: '班主任王老师', role: 'admin', position: '班主任' },
    { username: 'monitor', password: 'monitor123', real_name: '赵琳', role: 'admin', position: '班长' },
    { username: 'tuanshu', password: '123456', real_name: '陈晨', role: 'student', position: '团支书' },
    { username: 'study', password: '123456', real_name: '周明', role: 'student', position: '学习委员' },
    { username: 'life', password: '123456', real_name: '吴迪', role: 'student', position: '生活委员' }
  ];

  const insertUser = db.prepare(`INSERT OR IGNORE INTO users (username, password, real_name, role, position) VALUES (?, ?, ?, ?, ?)`);
  defaultUsers.forEach(u => insertUser.run(u.username, u.password, u.real_name, u.role, u.position));
  insertUser.finalize();

  console.log('数据库表初始化完成，默认用户已就绪。');
});

// ---------- API 路由 ----------

// 登录
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get(
    'SELECT id, username, real_name, role, position FROM users WHERE username = ? AND password = ?',
    [username, password],
    (err, user) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!user) return res.status(401).json({ error: '账号或密码错误' });
      res.json({ success: true, user });
    }
  );
});

// 获取当前用户信息 (通过id)
app.get('/api/user/:id', (req, res) => {
  db.get('SELECT id, username, real_name, role, position FROM users WHERE id = ?', [req.params.id], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(user || null);
  });
});

// 获取所有班委成员 (用于分配)
app.get('/api/committee', (req, res) => {
  db.all(`SELECT id, real_name, position FROM users WHERE position IS NOT NULL AND position != ''`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 获取意见列表 (支持排序: heat 或 time)
app.get('/api/opinions', (req, res) => {
  const sortByTime = req.query.sort === 'time';
  const sql = `
    SELECT o.*, u.real_name as author_display_name,
           (SELECT COUNT(*) FROM likes WHERE opinion_id = o.id) as like_count,
           (SELECT AVG(score) FROM ratings WHERE opinion_id = o.id) as avg_rating,
           (SELECT COUNT(*) FROM ratings WHERE opinion_id = o.id) as rating_count
    FROM opinions o
    LEFT JOIN users u ON o.author_id = u.id
    ORDER BY ${sortByTime ? 'o.created_at DESC' : 'o.heat DESC, o.created_at DESC'}
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    // 处理匿名显示
    rows = rows.map(r => ({
      ...r,
      display_name: r.is_anonymous ? '匿名同学' : r.author_display_name
    }));
    res.json(rows);
  });
});

// 发布新意见
app.post('/api/opinions', (req, res) => {
  const { title, content, target_role, is_anonymous, author_id } = req.body;
  // 获取作者真实姓名
  db.get('SELECT real_name FROM users WHERE id = ?', [author_id], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    const authorName = user.real_name;
    db.run(
      `INSERT INTO opinions (title, content, target_role, is_anonymous, author_id, author_name, status, assigned_to, heat)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?, 0)`,
      [title, content, target_role, is_anonymous ? 1 : 0, author_id, authorName, target_role],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
      }
    );
  });
});

// 点赞
app.post('/api/opinions/:id/like', (req, res) => {
  const opinionId = req.params.id;
  const { user_id } = req.body;
  db.run('INSERT OR IGNORE INTO likes (opinion_id, user_id) VALUES (?, ?)', [opinionId, user_id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    // 更新热度 (点赞数)
    db.run('UPDATE opinions SET heat = (SELECT COUNT(*) FROM likes WHERE opinion_id = ?) WHERE id = ?', [opinionId, opinionId]);
    res.json({ success: true });
  });
});

// 获取某个意见的回复/追问列表
app.get('/api/opinions/:id/replies', (req, res) => {
  db.all(
    `SELECT r.*, u.real_name as user_name FROM replies r
     LEFT JOIN users u ON r.user_id = u.id
     WHERE r.opinion_id = ? ORDER BY r.created_at ASC`,
    [req.params.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// 添加回复 (追问/回答)
app.post('/api/opinions/:id/replies', (req, res) => {
  const { user_id, content } = req.body;
  db.get('SELECT real_name FROM users WHERE id = ?', [user_id], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    db.run(
      'INSERT INTO replies (opinion_id, user_id, user_name, content) VALUES (?, ?, ?, ?)',
      [req.params.id, user_id, user.real_name, content],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
      }
    );
  });
});

// 管理员操作：完结问题
app.put('/api/opinions/:id/status', (req, res) => {
  const { status } = req.body; // 'closed' 或 'open'
  db.run('UPDATE opinions SET status = ? WHERE id = ?', [status, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// 管理员操作：重新分配对象
app.put('/api/opinions/:id/assign', (req, res) => {
  const { assigned_to } = req.body;
  db.run('UPDATE opinions SET assigned_to = ? WHERE id = ?', [assigned_to, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// 评分
app.post('/api/opinions/:id/rate', (req, res) => {
  const { user_id, score } = req.body;
  db.run(
    'INSERT OR REPLACE INTO ratings (opinion_id, user_id, score) VALUES (?, ?, ?)',
    [req.params.id, user_id, score],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// 启动服务
app.listen(port, () => {
  console.log(`班级办事通后端运行在 http://localhost:${port}`);
});