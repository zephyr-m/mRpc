# mRPC — Launch Plan

## Phase 1: npm (сегодня)

```bash
cd sdk/js
npm publish
```

- [x] package.json
- [x] README.md (npm-specific)
- [ ] `npm publish`
- [ ] Проверить: `npm info mrpc-client`

## Phase 2: PyPI

```bash
cd sdk/python
pip install build twine
python -m build
twine upload dist/*
```

- [ ] setup.py / pyproject.toml
- [ ] `pip install mrpc`

## Phase 3: Статья

Заголовок: **"I built an alternative to REST in 1 day. Here's the spec."**

Площадки:
- [ ] Dev.to
- [ ] Habr
- [ ] Medium

Рассылка:
- [ ] Reddit (r/programming, r/webdev, r/javascript, r/python)
- [ ] Hacker News (Show HN)
- [ ] X/Twitter тред
- [ ] Telegram каналы (webdev, javascript)

## Phase 4: SDK на других языках

| Язык | Пакетный менеджер | Приоритет |
|------|-------------------|-----------|
| Go | go get | 🔴 высокий |
| Rust | crates.io | 🟡 средний |
| C# | NuGet | 🟡 средний |
| Java | Maven | 🟡 средний |
| Ruby | RubyGems | 🟢 низкий |
| Dart | pub.dev | 🟢 низкий |
| Swift | Swift PM | 🟢 низкий |
| Kotlin | Maven | 🟢 низкий |

## Phase 5: Ecosystem

- [ ] mRPC Playground (онлайн тестер)
- [ ] mRPC Inspector (Chrome extension)
- [ ] Matrix → MCP converter
- [ ] VS Code extension (autocomplete commands)
