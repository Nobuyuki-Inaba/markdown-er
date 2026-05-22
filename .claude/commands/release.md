# Release手順 (markdown-er)

新しいバージョンをリリースするときの手順。バージョン番号は引数から取得する（例: `/release 0.1.0`）。
引数がない場合は現在の package.json のバージョンを確認してユーザーに確認する。

## 手順

### 1. リリースブランチ作成

```
git checkout main && git pull
git checkout -b chore/release-v<VERSION>
```

### 2. バージョン更新

以下のファイルを更新する:

**package.json** — `"version"` フィールドを新バージョンに変更

**CHANGELOG.md** — `[Unreleased]` セクションの下に新バージョンのエントリを追加:
```markdown
## [<VERSION>] - <TODAY_DATE>

### Added / Fixed / Changed
- ...

**README.md** - 前回リリースとの差分を更新し、ユーザが機能を理解できるようにする
**CLAUDE.md** - 前回リリースとの差分を更新

---
```
末尾のリンクも更新:
```
[Unreleased]: https://github.com/Nobuyuki-Inaba/markdown-er/compare/v<VERSION>...HEAD
[<VERSION>]: https://github.com/Nobuyuki-Inaba/markdown-er/compare/v<PREV_VERSION>...v<VERSION>
```

### 3. PRを作成してマージ

```
git add package.json CHANGELOG.md
git commit -m "chore: bump version to <VERSION>"
git push -u origin chore/release-v<VERSION>
gh pr create --title "chore: release v<VERSION>" --body "..."
```

マージされたことを確認してから次へ。

### 4. main を pull してタグを作成・プッシュ

```
git checkout main && git pull
git tag v<VERSION>
git push origin v<VERSION>
```

→ GitHub Actions (`release.yml`) が起動し、`.vsix` を自動ビルドして GitHub Release を作成する。

Actions の完了は以下で確認:
```
gh run list --limit 3
```

### 5. 手元でもパッケージを作成（Marketplace アップロード用）

```
npm install
npm run package
```
生成物: `markdown-er-<VERSION>.vsix`

> `npm run package` は内部で `vsce package` → `vscode:prepublish` → `npm run build` の順に実行するため、これ1コマンドで完結する。`npm run build` 単体はソースのビルドのみで .vsix は作らない。

### 6. Marketplace に手動アップロード

https://marketplace.visualstudio.com/manage にアクセスし、パブリッシャー `nobuyuki-inaba` で `.vsix` をアップロード。
