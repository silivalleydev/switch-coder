#!/bin/zsh
# Waits for the Flint GGUF download to finish, verifies size + sha256 against Hugging Face,
# then uploads it to the SwitchLog R2 "models" bucket (R2_MODELS_BUCKET, default switchlog-models).
# Credentials are read from switchlog-server/.env.local and never printed.
set -e
MODEL_DIR="$HOME/.switchcoder/models"
NAME="flint-UD-IQ3_XXS.gguf"
MODEL="$MODEL_DIR/$NAME"
ENV_FILE="${SWITCHLOG_ENV:-$HOME/workspace/switchlog-server/.env.local}"

echo "[$(date)] waiting for download..."
while pgrep -f "$NAME.part" >/dev/null; do sleep 30; done

META_FILE="$MODEL_DIR/.hf-meta.json"
curl -sf "https://huggingface.co/api/models/unsloth/flint-GGUF?blobs=true" -o "$META_FILE"
expected_size=$(python3 -I -c "import json;s=[x for x in json.load(open('$META_FILE'))['siblings'] if x['rfilename']=='$NAME'][0];print(s['size'])")
expected_sha=$(python3 -I -c "import json;s=[x for x in json.load(open('$META_FILE'))['siblings'] if x['rfilename']=='$NAME'][0];print(s['lfs']['sha256'])")

if [ -f "$MODEL.part" ]; then
  size=$(stat -f%z "$MODEL.part")
  if [ "$size" != "$expected_size" ]; then echo "size mismatch: $size != $expected_size (download incomplete?)"; exit 1; fi
  mv "$MODEL.part" "$MODEL"
fi
[ -f "$MODEL" ] || { echo "model file missing"; exit 1; }

echo "[$(date)] verifying sha256..."
actual_sha=$(shasum -a 256 "$MODEL" | awk '{print $1}')
if [ "$actual_sha" != "$expected_sha" ]; then echo "sha256 mismatch"; exit 1; fi
echo "sha256 OK: $actual_sha"
echo "$actual_sha" > "$MODEL.sha256"

set -a; source "$ENV_FILE"; set +a
: "${R2_ACCOUNT_ID:?}" "${R2_ACCESS_KEY_ID:?}" "${R2_SECRET_ACCESS_KEY:?}"
export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
  RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  RCLONE_CONFIG_R2_ENDPOINT="https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com" RCLONE_CONFIG_R2_ACL=private
BUCKET="${R2_MODELS_BUCKET:-switchlog-models}"
KEY="flint/$NAME"

rclone lsd "r2:$BUCKET" >/dev/null 2>&1 || rclone mkdir "r2:$BUCKET" || { echo "bucket $BUCKET missing and could not be created (token scope?)"; exit 1; }
echo "[$(date)] uploading to r2:$BUCKET/$KEY ..."
rclone copyto "$MODEL" "r2:$BUCKET/$KEY" --s3-chunk-size 64M --s3-upload-concurrency 4 --stats 30s --stats-one-line
printf '{"name":"%s","size":%s,"sha256":"%s","key":"%s","source":"unsloth/flint-GGUF"}\n' "$NAME" "$expected_size" "$actual_sha" "$KEY" > "$MODEL_DIR/flint.manifest.json"
rclone copyto "$MODEL_DIR/flint.manifest.json" "r2:$BUCKET/flint/manifest.json"
echo "[$(date)] upload done"
