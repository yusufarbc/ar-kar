#!/usr/bin/env bash
#
# ar-kar — Cloudflare kurulum otomasyonu
#
# Bu script; Worker deploy'unu, custom domain bağlamalarını, panel.ar-kar.com
# için yurtdışı engelleyici WAF kuralını ve panel yönlendirme kuralını
# oluşturur. Idempotent'tir — güvenle tekrar çalıştırılabilir.
#
# Bağımlılıklar: bash, curl, node (jq GEREKMEZ).
# Windows'ta Git Bash ile çalışır.
#
# Kullanım:
#   export CLOUDFLARE_API_TOKEN=...
#   export CLOUDFLARE_ACCOUNT_ID=...
#   export CLOUDFLARE_ZONE_ID=...                 # ar-kar.com zone ID'si
#   bash scripts/setup-cloudflare.sh              # tüm adımlar
#   bash scripts/setup-cloudflare.sh --dry-run    # sadece yapılacakları yazdır
#   bash scripts/setup-cloudflare.sh domains waf  # seçili adımlar
#
# Adımlar: deploy | domains | waf | redirect | verify
#
# API Token izinleri (Cloudflare Dashboard > My Profile > API Tokens):
#   Account -> Workers Scripts : Edit
#   Account -> Account Settings: Read
#   Zone    -> Workers Routes  : Edit
#   Zone    -> Zone WAF        : Edit
#   Zone    -> Zone Settings   : Read
#   Zone    -> DNS             : Edit

set -euo pipefail

# --------------------------------------------------------------------------
# Ayarlar (ortam değişkeni ile geçersiz kılınabilir)
# --------------------------------------------------------------------------
WORKER_NAME="${WORKER_NAME:-ar-kar}"
APEX_DOMAIN="${APEX_DOMAIN:-ar-kar.com}"
WWW_DOMAIN="${WWW_DOMAIN:-www.ar-kar.com}"
PANEL_DOMAIN="${PANEL_DOMAIN:-panel.ar-kar.com}"
ALLOWED_COUNTRY="${ALLOWED_COUNTRY:-TR}"
API="https://api.cloudflare.com/client/v4"

WAF_RULE_DESC="ar-kar: panel yurtdisi erisim engeli"
REDIRECT_RULE_DESC="ar-kar: panel kok yonlendirme"

DRY_RUN=0
STEPS=()

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    deploy|domains|waf|redirect|verify) STEPS+=("$arg") ;;
    -h|--help) sed -n '2,29p' "$0"; exit 0 ;;
    *) echo "Bilinmeyen argüman: $arg" >&2; exit 1 ;;
  esac
done
[ ${#STEPS[@]} -eq 0 ] && STEPS=(deploy domains waf redirect verify)

# --------------------------------------------------------------------------
# Yardımcılar
# --------------------------------------------------------------------------
c_info() { printf '\033[0;36m==>\033[0m %s\n' "$*"; }
c_ok()   { printf '\033[0;32m  OK\033[0m %s\n' "$*"; }
c_warn() { printf '\033[0;33m  ! \033[0m %s\n' "$*"; }
c_fail() { printf '\033[0;31m  X \033[0m %s\n' "$*" >&2; }

require_cmd() {
  local missing=0
  for cmd in "$@"; do
    command -v "$cmd" >/dev/null 2>&1 || { c_fail "Gerekli komut bulunamadı: $cmd"; missing=1; }
  done
  [ "$missing" -eq 1 ] && exit 1
  return 0
}

require_env() {
  local missing=0
  for var in "$@"; do
    [ -z "${!var:-}" ] && { c_fail "Ortam değişkeni eksik: $var"; missing=1; }
  done
  [ "$missing" -eq 1 ] && exit 1
  return 0
}

# json_build <<< bir JS ifadesi; stdin'den JS objesi okur, JSON basar.
# Değerler ortam değişkeni olarak geçirilir (enjeksiyon riski yok).
json_build() { node -e "process.stdout.write(JSON.stringify($1))"; }

# json_query <json> <js-ifadesi>  — $ değişkeni parse edilmiş objedir.
json_query() {
  JSON_INPUT="$1" node -e '
    let $;
    try { $ = JSON.parse(process.env.JSON_INPUT); } catch { process.exit(2); }
    const out = eval(process.argv[1]);
    if (out === undefined || out === null) process.exit(1);
    if (out === false) process.exit(1);
    if (out === true) process.exit(0);
    process.stdout.write(String(out));
  ' "$2"
}

# cf <METHOD> <PATH> [BODY]
cf() {
  local method="$1" path="$2" body="${3:-}"

  if [ "$DRY_RUN" -eq 1 ] && [ "$method" != "GET" ]; then
    echo "[dry-run] $method $path" >&2
    [ -n "$body" ] && echo "[dry-run] body: $body" >&2
    echo '{"success":true,"result":{"id":"DRY_RUN"},"dry_run":true}'
    return 0
  fi

  local args=(-sS -X "$method" "$API$path"
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
    -H "Content-Type: application/json")
  [ -n "$body" ] && args+=(--data "$body")

  curl "${args[@]}"
}

cf_ok()     { json_query "$1" '$.success === true' >/dev/null 2>&1; }
cf_errors() { json_query "$1" '($.errors||[]).map(e => "      ["+e.code+"] "+e.message).join("\n")' 2>/dev/null || true; }

# --------------------------------------------------------------------------
# 1) Worker deploy — worker ilk deploy'da otomatik oluşturulur
# --------------------------------------------------------------------------
step_deploy() {
  c_info "Worker build & deploy: $WORKER_NAME"

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[dry-run] npm run build"
    echo "[dry-run] npx wrangler deploy --name $WORKER_NAME"
    return 0
  fi

  npm run build
  npx wrangler deploy --name "$WORKER_NAME"
  c_ok "Worker deploy edildi"
}

# --------------------------------------------------------------------------
# 2) Custom domain bağlama
# --------------------------------------------------------------------------
attach_domain() {
  local hostname="$1"
  c_info "Custom domain: $hostname -> $WORKER_NAME"

  local body resp
  body=$(CF_ZONE="$CLOUDFLARE_ZONE_ID" CF_HOST="$hostname" CF_SVC="$WORKER_NAME" \
    json_build '{zone_id:process.env.CF_ZONE, hostname:process.env.CF_HOST, service:process.env.CF_SVC, environment:"production"}')

  resp=$(cf PUT "/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/domains" "$body")

  if cf_ok "$resp"; then
    c_ok "$hostname bağlandı"
  elif echo "$resp" | grep -qiE 'already|exists|duplicate'; then
    c_ok "$hostname zaten bağlı (atlandı)"
  else
    c_fail "$hostname bağlanamadı"
    cf_errors "$resp"
    return 1
  fi
}

step_domains() {
  attach_domain "$APEX_DOMAIN"
  attach_domain "$WWW_DOMAIN"
  attach_domain "$PANEL_DOMAIN"
  c_warn "Custom Domain eklendiğinde Cloudflare proxied DNS kaydını otomatik oluşturur."
  c_warn "Alan adının nameserver'ları Cloudflare'i göstermiyorsa bu adım başarısız olur."
}

# --------------------------------------------------------------------------
# Ruleset yardımcısı: verilen phase için entrypoint ruleset id'sini döndürür,
# yoksa oluşturur. Aynı açıklamaya sahip kural varsa "EXISTS" basar.
# --------------------------------------------------------------------------
ensure_ruleset() {
  local phase="$1" desc="$2" rs_name="$3"
  local rs resp rs_id

  rs=$(cf GET "/zones/$CLOUDFLARE_ZONE_ID/rulesets/phases/$phase/entrypoint")

  if cf_ok "$rs"; then
    if RULE_DESC="$desc" json_query "$rs" \
         '((($.result||{}).rules)||[]).some(r => r.description === process.env.RULE_DESC)' >/dev/null 2>&1; then
      echo "EXISTS"
      return 0
    fi
    rs_id=$(json_query "$rs" '$.result.id')
    echo "$rs_id"
    return 0
  fi

  c_info "Ruleset bulunamadı ($phase), oluşturuluyor" >&2
  local create_body
  create_body=$(CF_RS_NAME="$rs_name" CF_PHASE="$phase" \
    json_build '{name:process.env.CF_RS_NAME, kind:"zone", phase:process.env.CF_PHASE, rules:[]}')
  resp=$(cf POST "/zones/$CLOUDFLARE_ZONE_ID/rulesets" "$create_body")

  if ! cf_ok "$resp"; then
    c_fail "Ruleset oluşturulamadı ($phase)" >&2
    cf_errors "$resp" >&2
    return 1
  fi
  json_query "$resp" '$.result.id'
}

# --------------------------------------------------------------------------
# 3) WAF — panel.ar-kar.com yurtdışı erişimini engelle
# --------------------------------------------------------------------------
step_waf() {
  local expr="(http.host eq \"$PANEL_DOMAIN\" and ip.geoip.country ne \"$ALLOWED_COUNTRY\")"

  c_info "WAF kuralı: yalnızca $ALLOWED_COUNTRY ülkesinden erişim ($PANEL_DOMAIN)"
  echo "      İfade : $expr"
  echo "      Eylem : block"

  local rs_id
  rs_id=$(RULE_DESC="$WAF_RULE_DESC" ensure_ruleset \
    "http_request_firewall_custom" "$WAF_RULE_DESC" "ar-kar custom firewall") || return 1

  if [ "$rs_id" = "EXISTS" ]; then
    c_ok "WAF kuralı zaten mevcut (atlandı)"
    return 0
  fi

  local rule_body resp
  rule_body=$(CF_EXPR="$expr" CF_DESC="$WAF_RULE_DESC" \
    json_build '{action:"block", expression:process.env.CF_EXPR, description:process.env.CF_DESC, enabled:true}')

  resp=$(cf POST "/zones/$CLOUDFLARE_ZONE_ID/rulesets/$rs_id/rules" "$rule_body")
  if cf_ok "$resp"; then
    c_ok "WAF engelleme kuralı oluşturuldu"
  else
    c_fail "WAF kuralı oluşturulamadı"; cf_errors "$resp"; return 1
  fi
}

# --------------------------------------------------------------------------
# 4) Single Redirect — panel.ar-kar.com/* -> /keystatic/
# --------------------------------------------------------------------------
# public/_redirects host (alan adı) eşleştiremediği için bu kural edge
# seviyesinde tanımlanır. Panel host'unda yalnızca Keystatic arayüzü ve API'si
# servis edilir; diğer tüm yollar /keystatic/ adresine yönlendirilir. Bu aynı
# zamanda panel host'unun sitenin kopyasını yayınlamasını (duplicate content)
# önler.
# --------------------------------------------------------------------------
step_redirect() {
  local expr="(http.host eq \"$PANEL_DOMAIN\" and not starts_with(http.request.uri.path, \"/keystatic\") and not starts_with(http.request.uri.path, \"/api/keystatic\"))"

  c_info "Redirect kuralı: $PANEL_DOMAIN/* -> https://$PANEL_DOMAIN/keystatic/"
  echo "      İfade : $expr"

  local rs_id
  rs_id=$(RULE_DESC="$REDIRECT_RULE_DESC" ensure_ruleset \
    "http_request_dynamic_redirect" "$REDIRECT_RULE_DESC" "ar-kar redirects") || return 1

  if [ "$rs_id" = "EXISTS" ]; then
    c_ok "Redirect kuralı zaten mevcut (atlandı)"
    return 0
  fi

  local rule_body resp
  rule_body=$(CF_EXPR="$expr" CF_DESC="$REDIRECT_RULE_DESC" CF_TARGET="https://$PANEL_DOMAIN/keystatic/" \
    json_build '{
      action: "redirect",
      expression: process.env.CF_EXPR,
      description: process.env.CF_DESC,
      enabled: true,
      action_parameters: {
        from_value: {
          status_code: 302,
          target_url: { value: process.env.CF_TARGET },
          preserve_query_string: false
        }
      }
    }')

  resp=$(cf POST "/zones/$CLOUDFLARE_ZONE_ID/rulesets/$rs_id/rules" "$rule_body")
  if cf_ok "$resp"; then
    c_ok "Redirect kuralı oluşturuldu"
  else
    c_fail "Redirect kuralı oluşturulamadı"; cf_errors "$resp"; return 1
  fi
}

# --------------------------------------------------------------------------
# 5) Doğrulama
# --------------------------------------------------------------------------
step_verify() {
  c_info "Doğrulama"

  local resp
  resp=$(cf GET "/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/domains?zone_id=$CLOUDFLARE_ZONE_ID")
  if cf_ok "$resp"; then
    echo "      Bağlı custom domain'ler:"
    json_query "$resp" '($.result||[]).map(d => "        - "+d.hostname+" -> "+d.service).join("\n") || "        (yok)"' || true
    echo ""
  else
    c_warn "Custom domain listesi alınamadı"
  fi

  for phase in http_request_firewall_custom http_request_dynamic_redirect; do
    resp=$(cf GET "/zones/$CLOUDFLARE_ZONE_ID/rulesets/phases/$phase/entrypoint")
    if cf_ok "$resp"; then
      echo "      $phase kuralları:"
      json_query "$resp" '((($.result||{}).rules)||[]).map(r => "        - ["+r.action+"] "+(r.description||r.expression)).join("\n") || "        (yok)"' || true
      echo ""
    fi
  done

  c_info "Manuel doğrulama"
  echo "      curl -sI https://$APEX_DOMAIN/            # 200"
  echo "      curl -sI https://$PANEL_DOMAIN/           # 302 -> /keystatic/"
  echo "      curl -sI https://$PANEL_DOMAIN/keystatic/ # TR IP: 200, yurtdışı: 403"
}

# --------------------------------------------------------------------------
main() {
  require_cmd curl node npx
  require_env CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_ZONE_ID

  [ "$DRY_RUN" -eq 1 ] && c_warn "DRY-RUN: hiçbir değişiklik uygulanmayacak"

  for step in "${STEPS[@]}"; do
    "step_$step"
    echo ""
  done

  c_ok "Tamamlandı"
}

main
