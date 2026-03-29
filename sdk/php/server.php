<?php

declare(strict_types=1);

/**
 * mRPC Server — PHP Reference Implementation
 *
 * Один endpoint. Один формат. Ноль роутинга.
 *
 * Usage:
 *   php -S 0.0.0.0:8088 server.php
 *
 * API:
 *   POST / {"cmd": "ping"}
 *   GET  /?cmd=ping
 */

// ── Config ───────────────────────────────────────────────────────────────

$VERSION = 'mRPC/1.0';

// ── CORS ─────────────────────────────────────────────────────────────────

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Parse Input ──────────────────────────────────────────────────────────

$start = microtime(true);

$input = $_SERVER['REQUEST_METHOD'] === 'POST'
    ? json_decode(file_get_contents('php://input'), true) ?? []
    : $_GET;

$cmd = $input['cmd'] ?? null;
unset($input['cmd']);
$params = $input;

// ── Matrix ───────────────────────────────────────────────────────────────

// Загрузить матрицу команд
$matrixFile = getenv('MRPC_MATRIX') ?: __DIR__ . '/commands.json';
$matrix = [];

if (file_exists($matrixFile)) {
    $ext = pathinfo($matrixFile, PATHINFO_EXTENSION);
    $matrix = match ($ext) {
        'json' => json_decode(file_get_contents($matrixFile), true) ?? [],
        'php'  => require $matrixFile,
        default => [],
    };
}

// ── Built-in Commands ────────────────────────────────────────────────────

// help — self-documentation
$matrix['help'] = $matrix['help'] ?? [
    'type' => 'raw',
    'handler' => function ($params, $matrix) {
        $cmds = [];
        foreach ($matrix as $name => $entry) {
            $cmds[$name] = [
                'type'   => $entry['type'] ?? 'unknown',
                'params' => $entry['params'] ?? [],
            ];
            if (isset($entry['validate'])) $cmds[$name]['validate'] = $entry['validate'];
            if (isset($entry['roles']))    $cmds[$name]['roles'] = $entry['roles'];
        }
        return ['commands' => $cmds, 'total' => count($cmds)];
    },
];

// describe — introspection
$matrix['describe'] = $matrix['describe'] ?? [
    'type' => 'raw',
    'handler' => function ($params, $matrix) {
        $name = $params['command'] ?? null;
        if (!$name || !isset($matrix[$name])) {
            return ['error' => 'Command not found: ' . ($name ?? 'null')];
        }
        $entry = $matrix[$name];
        unset($entry['handler']); // Don't expose closures
        return array_merge(['name' => $name], $entry);
    },
];

// ping — health check
$matrix['ping'] = $matrix['ping'] ?? [
    'type' => 'raw',
    'handler' => fn($p, $m) => ['pong' => true, 'commands' => count($m), 'ts' => date('c')],
];

// ── Dispatch ─────────────────────────────────────────────────────────────

function respond(string $cmd, bool $ok, array $extra, float $start, string $version): never
{
    $ms = round((microtime(true) - $start) * 1000, 2);
    $response = array_merge(['ok' => $ok, 'cmd' => $cmd, 'v' => $version, 'ms' => $ms], $extra);
    echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

function error(string $cmd, string $code, string $message, float $start, string $version, array $extra = []): never
{
    respond($cmd, false, ['error' => array_merge(['code' => $code, 'message' => $message], $extra)], $start, $version);
}

// No cmd
if ($cmd === null) {
    // Self-documentation: return help
    $cmd = 'help';
}

// Unknown cmd
if (!isset($matrix[$cmd])) {
    $available = array_keys($matrix);
    error($cmd, 'unknown_cmd', "Unknown command: {$cmd}", $start, $VERSION, ['commands' => $available]);
}

$entry = $matrix[$cmd];
$type = $entry['type'] ?? 'raw';

// ── Auth check ───────────────────────────────────────────────────────────

if (isset($entry['roles'])) {
    $token = $_SERVER['HTTP_AUTHORIZATION'] ?? $params['token'] ?? null;
    $role = 'guest'; // TODO: resolve from token
    if ($token && str_starts_with($token, 'Bearer ')) {
        $role = 'admin'; // TODO: JWT decode
    }
    if (!in_array($role, $entry['roles'])) {
        error($cmd, 'access_denied', "Access denied: {$cmd} requires [" . implode(', ', $entry['roles']) . "], got {$role}", $start, $VERSION);
    }
}

// ── Validate params ──────────────────────────────────────────────────────

$requiredParams = [];
$defaultParams  = [];

if (isset($entry['params'])) {
    if (array_is_list($entry['params'])) {
        $requiredParams = $entry['params'];
    } else {
        $defaultParams = $entry['params'];
    }
}

// Check required
foreach ($requiredParams as $p) {
    if (!isset($params[$p]) || $params[$p] === '') {
        error($cmd, 'missing_param', "Missing required parameter: {$p}", $start, $VERSION, ['param' => $p]);
    }
}

// Apply defaults
foreach ($defaultParams as $k => $v) {
    if (!isset($params[$k])) {
        $params[$k] = $v;
    }
}

// ── Validate rules ───────────────────────────────────────────────────────

if (isset($entry['validate'])) {
    $errors = [];
    foreach ($entry['validate'] as $field => $rules) {
        $value = $params[$field] ?? null;
        foreach (explode('|', $rules) as $rule) {
            $ruleName = explode(':', $rule, 2)[0];
            $ruleParam = explode(':', $rule, 2)[1] ?? null;

            $failed = match ($ruleName) {
                'required' => $value === null || $value === '',
                'integer'  => $value !== null && !ctype_digit((string)$value),
                'numeric'  => $value !== null && !is_numeric($value),
                'string'   => $value !== null && !is_string($value),
                'email'    => $value !== null && !filter_var($value, FILTER_VALIDATE_EMAIL),
                'min'      => $value !== null && strlen((string)$value) < (int)$ruleParam,
                'max'      => $value !== null && strlen((string)$value) > (int)$ruleParam,
                default    => false,
            };

            if ($failed) {
                $errors[] = ['field' => $field, 'rule' => $rule, 'message' => "{$field}: {$rule}"];
            }
        }
    }

    if (!empty($errors)) {
        error($cmd, 'validation_failed', 'Validation failed for ' . count($errors) . ' field(s)', $start, $VERSION, ['details' => $errors]);
    }
}

// ── Execute ──────────────────────────────────────────────────────────────

match ($type) {
    'raw' => (function () use ($cmd, $entry, $params, $matrix, $start, $VERSION) {
        if (!isset($entry['handler']) || !($entry['handler'] instanceof \Closure)) {
            error($cmd, 'internal', 'No handler for raw command', $start, $VERSION);
        }
        $data = ($entry['handler'])($params, $matrix);
        respond($cmd, true, ['data' => $data], $start, $VERSION);
    })(),

    'query' => (function () use ($cmd, $entry, $params, $start, $VERSION) {
        $dbPath = getenv('MRPC_DB') ?: __DIR__ . '/data.db';
        $db = new SQLite3($dbPath, SQLITE3_OPEN_READWRITE | SQLITE3_OPEN_CREATE);
        $db->exec("PRAGMA journal_mode=WAL");

        $stmt = $db->prepare($entry['sql']);
        if (!$stmt) error($cmd, 'internal', 'SQL prepare failed: ' . $db->lastErrorMsg(), $start, $VERSION);

        foreach ($params as $k => $v) $stmt->bindValue(":{$k}", $v);
        $result = $stmt->execute();
        $rows = [];
        while ($r = $result->fetchArray(SQLITE3_ASSOC)) $rows[] = $r;

        respond($cmd, true, ['data' => $rows, 'count' => count($rows)], $start, $VERSION);
    })(),

    'exec' => (function () use ($cmd, $entry, $params, $start, $VERSION) {
        $dbPath = getenv('MRPC_DB') ?: __DIR__ . '/data.db';
        $db = new SQLite3($dbPath, SQLITE3_OPEN_READWRITE | SQLITE3_OPEN_CREATE);
        $db->exec("PRAGMA journal_mode=WAL");

        $stmt = $db->prepare($entry['sql']);
        if (!$stmt) error($cmd, 'internal', 'SQL prepare failed: ' . $db->lastErrorMsg(), $start, $VERSION);

        foreach ($params as $k => $v) $stmt->bindValue(":{$k}", $v);
        $stmt->execute();

        respond($cmd, true, ['changes' => $db->changes()], $start, $VERSION);
    })(),

    default => error($cmd, 'internal', "Unknown type: {$type}", $start, $VERSION),
};
