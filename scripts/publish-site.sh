#!/usr/bin/env bash
set -euo pipefail

project_id=$(node -e "console.log(JSON.parse(require('fs').readFileSync('.openai/hosting.json','utf8')).project_id)")
remote_url="${SITE_REMOTE_URL:-}"
token="${SITE_SOURCE_TOKEN:-}"

if [[ -z "$token" || -z "$remote_url" ]]; then
  echo "Usage: SITE_SOURCE_TOKEN=... SITE_REMOTE_URL=... npm run publish"
  echo "先通过 Sites 发布工具获取短期凭证，再执行此命令。项目：$project_id"
  exit 1
fi

npx oxfmt app/page.tsx app/globals.css
npm run lint
npx tsc --noEmit
npm run build

archive="/tmp/${project_id}-$(date +%s).tar.gz"
git add app package.json scripts
git commit -m "chore: publish site update" || true
git -c http.extraHeader="Authorization: Bearer $token" push "$remote_url" HEAD:main
/Users/phobal/.codex/plugins/cache/openai-bundled/sites/0.1.57/scripts/package-site.sh "$PWD" "$archive"
echo "已推送并打包：$archive"
echo "接下来在 Sites 中保存并部署该 commit：$(git rev-parse HEAD)"
