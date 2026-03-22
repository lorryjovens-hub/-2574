<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

session_start();

$dbFile = __DIR__ . '/../data/users.db';
$dbDir = dirname($dbFile);
if (!is_dir($dbDir)) {
    mkdir($dbDir, 0755, true);
}

try {
    $db = new SQLite3($dbFile);
    $db->exec('CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME
    )');
    
    $db->exec('CREATE TABLE IF NOT EXISTS user_favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        video_id TEXT NOT NULL,
        video_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, video_id)
    )');
    
    $db->exec('CREATE TABLE IF NOT EXISTS user_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        video_id TEXT NOT NULL,
        video_name TEXT,
        episode TEXT,
        last_watch DATETIME DEFAULT CURRENT_TIMESTAMP
    )');
} catch (Exception $e) {
    jsonResponse(false, '数据库连接失败: ' . $e->getMessage());
}

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'register':
        handleRegister($db);
        break;
    case 'login':
        handleLogin($db);
        break;
    case 'logout':
        handleLogout();
        break;
    case 'check':
        handleCheckLogin();
        break;
    case 'favorites':
        handleFavorites($db);
        break;
    case 'history':
        handleHistory($db);
        break;
    default:
        jsonResponse(false, '未知操作');
}

function jsonResponse($success, $message = '', $data = null) {
    echo json_encode([
        'success' => $success,
        'message' => $message,
        'data' => $data
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function handleRegister($db) {
    $input = json_decode(file_get_contents('php://input'), true);
    $username = trim($input['username'] ?? '');
    $password = $input['password'] ?? '';
    $email = trim($input['email'] ?? '');
    
    if (strlen($username) < 3 || strlen($username) > 20) {
        jsonResponse(false, '用户名长度需要在3-20个字符之间');
    }
    
    if (strlen($password) < 6) {
        jsonResponse(false, '密码长度至少6个字符');
    }
    
    $stmt = $db->prepare('SELECT id FROM users WHERE username = :username');
    $stmt->bindValue(':username', $username, SQLITE3_TEXT);
    $result = $stmt->execute();
    
    if ($result->fetchArray()) {
        jsonResponse(false, '用户名已存在');
    }
    
    $hashedPassword = password_hash($password, PASSWORD_DEFAULT);
    
    $stmt = $db->prepare('INSERT INTO users (username, password, email) VALUES (:username, :password, :email)');
    $stmt->bindValue(':username', $username, SQLITE3_TEXT);
    $stmt->bindValue(':password', $hashedPassword, SQLITE3_TEXT);
    $stmt->bindValue(':email', $email, SQLITE3_TEXT);
    
    if ($stmt->execute()) {
        $_SESSION['user_id'] = $db->lastInsertRowID();
        $_SESSION['username'] = $username;
        jsonResponse(true, '注册成功', ['username' => $username]);
    } else {
        jsonResponse(false, '注册失败，请稍后重试');
    }
}

function handleLogin($db) {
    $input = json_decode(file_get_contents('php://input'), true);
    $username = trim($input['username'] ?? '');
    $password = $input['password'] ?? '';
    
    if (empty($username) || empty($password)) {
        jsonResponse(false, '请输入用户名和密码');
    }
    
    $stmt = $db->prepare('SELECT id, username, password FROM users WHERE username = :username');
    $stmt->bindValue(':username', $username, SQLITE3_TEXT);
    $result = $stmt->execute();
    $user = $result->fetchArray(SQLITE3_ASSOC);
    
    if (!$user || !password_verify($password, $user['password'])) {
        jsonResponse(false, '用户名或密码错误');
    }
    
    $stmt = $db->prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = :id');
    $stmt->bindValue(':id', $user['id'], SQLITE3_INTEGER);
    $stmt->execute();
    
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['username'] = $user['username'];
    
    jsonResponse(true, '登录成功', ['username' => $user['username']]);
}

function handleLogout() {
    session_destroy();
    jsonResponse(true, '已退出登录');
}

function handleCheckLogin() {
    if (isset($_SESSION['user_id']) && isset($_SESSION['username'])) {
        jsonResponse(true, '已登录', [
            'user_id' => $_SESSION['user_id'],
            'username' => $_SESSION['username']
        ]);
    } else {
        jsonResponse(false, '未登录');
    }
}

function handleFavorites($db) {
    if (!isset($_SESSION['user_id'])) {
        jsonResponse(false, '请先登录');
    }
    
    $userId = $_SESSION['user_id'];
    $method = $_SERVER['REQUEST_METHOD'];
    
    if ($method === 'GET') {
        $stmt = $db->prepare('SELECT video_id, video_name, created_at FROM user_favorites WHERE user_id = :user_id ORDER BY created_at DESC');
        $stmt->bindValue(':user_id', $userId, SQLITE3_INTEGER);
        $result = $stmt->execute();
        
        $favorites = [];
        while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
            $favorites[] = $row;
        }
        jsonResponse(true, '', $favorites);
    } elseif ($method === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true);
        $videoId = $input['video_id'] ?? '';
        $videoName = $input['video_name'] ?? '';
        
        if (empty($videoId)) {
            jsonResponse(false, '缺少视频ID');
        }
        
        $stmt = $db->prepare('INSERT OR REPLACE INTO user_favorites (user_id, video_id, video_name) VALUES (:user_id, :video_id, :video_name)');
        $stmt->bindValue(':user_id', $userId, SQLITE3_INTEGER);
        $stmt->bindValue(':video_id', $videoId, SQLITE3_TEXT);
        $stmt->bindValue(':video_name', $videoName, SQLITE3_TEXT);
        
        if ($stmt->execute()) {
            jsonResponse(true, '收藏成功');
        } else {
            jsonResponse(false, '收藏失败');
        }
    } elseif ($method === 'DELETE') {
        $input = json_decode(file_get_contents('php://input'), true);
        $videoId = $input['video_id'] ?? '';
        
        $stmt = $db->prepare('DELETE FROM user_favorites WHERE user_id = :user_id AND video_id = :video_id');
        $stmt->bindValue(':user_id', $userId, SQLITE3_INTEGER);
        $stmt->bindValue(':video_id', $videoId, SQLITE3_TEXT);
        
        if ($stmt->execute()) {
            jsonResponse(true, '已取消收藏');
        } else {
            jsonResponse(false, '操作失败');
        }
    }
}

function handleHistory($db) {
    if (!isset($_SESSION['user_id'])) {
        jsonResponse(false, '请先登录');
    }
    
    $userId = $_SESSION['user_id'];
    $method = $_SERVER['REQUEST_METHOD'];
    
    if ($method === 'GET') {
        $stmt = $db->prepare('SELECT video_id, video_name, episode, last_watch FROM user_history WHERE user_id = :user_id ORDER BY last_watch DESC LIMIT 50');
        $stmt->bindValue(':user_id', $userId, SQLITE3_INTEGER);
        $result = $stmt->execute();
        
        $history = [];
        while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
            $history[] = $row;
        }
        jsonResponse(true, '', $history);
    } elseif ($method === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true);
        $videoId = $input['video_id'] ?? '';
        $videoName = $input['video_name'] ?? '';
        $episode = $input['episode'] ?? '';
        
        if (empty($videoId)) {
            jsonResponse(false, '缺少视频ID');
        }
        
        $stmt = $db->prepare('INSERT INTO user_history (user_id, video_id, video_name, episode) VALUES (:user_id, :video_id, :video_name, :episode)');
        $stmt->bindValue(':user_id', $userId, SQLITE3_INTEGER);
        $stmt->bindValue(':video_id', $videoId, SQLITE3_TEXT);
        $stmt->bindValue(':video_name', $videoName, SQLITE3_TEXT);
        $stmt->bindValue(':episode', $episode, SQLITE3_TEXT);
        
        $stmt->execute();
        jsonResponse(true, '记录已保存');
    }
}
