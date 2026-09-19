# PROMPT CHIEN — Vá 2 lỗ hổng bảo mật (path traversal + hash trước validate)

Ngày: 2026-09-19 · Quy trình: team `software-promptchien` (BugFix: kỹ sư sửa → QA kiểm chứng độc lập)

---

## TL;DR

Đã vá cả 2 lỗ hổng, cộng thêm 2 lỗ hổng phát sinh mà QA tìm ra khi cố tình đánh sập bản sửa.
**125/125 test PASS**, hash của 5 bot mẫu và digest determinism **không đổi một byte**.

---

## 1. Lỗ hổng 1 — CLI path traversal

**Trước:** `packages/cli/src/index.ts` dùng `resolve(ROOT, userPath)` rồi đọc/ghi file mà không
kiểm tra containment. `../../outside.json` hoặc đường dẫn tuyệt đối đọc/ghi được ra ngoài project.

**Sau:** helper `packages/cli/src/paths.ts` → `safeProjectPath(root, userPath)` + `ProjectPathError`,
áp cho **toàn bộ** đường dẫn CLI đọc và ghi (`loadBot`, `writeOut`, đọc replay, `--ensure-dirs`).

Hai lớp kiểm tra containment:

1. **Chuỗi** — `path.relative(root, abs)`; chặn `..`, `..<sep>`, đường dẫn tuyệt đối. Dùng
   `path.relative` chứ **không** dùng `abs.startsWith(root)` — kiểu startsWith sai kinh điển sẽ
   lọt thư mục anh em cùng tiền tố (`prompt-battle-home-evil`).
2. **Đường dẫn thật** — `realpathSync` cả hai phía để chặn symlink/junction.

Chặn được: `../`, `../../`, absolute ngoài root, UNC `\\server\share\x`, drive-relative `C:foo`,
thư mục anh em cùng tiền tố, **và junction/symlink trỏ ra ngoài**.
Chặn thêm: drive-relative `C:foo` bằng regex riêng trên win32, vì `path.resolve` có thể gộp nó
về trong root khi root cùng ổ đĩa.

---

## 2. Lỗ hổng 2 — Bot JSON bị hash trước khi validate

**Trước:** `validateBot()` gọi `hashDefinition(def)` **trước** `checkDefinition()`. Input như `{}`
ném `TypeError: Cannot read properties of undefined (reading 'map')` tại `hash.ts:14` thay vì trả
báo cáo `INVALID`. Kèm theo: `canonicalJson()` đệ quy không giới hạn → cây lồng sâu gây tràn stack.

**Sau — thứ tự đúng:**

1. `guardStructure()` — duyệt **lặp** (stack tường minh, không đệ quy) trên input thô, trần
   **128 tầng / 100.000 node**. Vượt trần → trả `BOT_TOO_DEEP` / `BOT_TOO_LARGE`, không đi tiếp.
2. `isHashable()` — chỉ khi hình dạng đủ an toàn mới tính hash thật.
3. Lời gọi `hashDefinition` được bọc try/catch **hẹp** (chỉ quanh đúng lời gọi đó); thất bại →
   push issue `error` `BOT_UNHASHABLE` + hash sentinel `'0'.repeat(64)`.
4. `packages/contracts/src/canonical.ts` — trần đệ quy `MAX_CANONICAL_DEPTH = 1024`, ném `Error`
   rõ nghĩa thay vì `RangeError` tràn stack (bảo vệ mọi caller, kể cả hash replay).

**Invariant:** hash sentinel **không bao giờ** đi kèm `ok: true` — nên không có chuyện bot hỏng
bị báo `VALID` với hash giả.

**Ngưỡng an toàn:** trần 128 tầng nằm xa trên ngưỡng hợp lệ. Kiểm chứng: brain lồng đúng
`BRAIN_MAX_DEPTH = 16` vẫn `ok: true` với hash thật; 17 tầng bị `BRAIN_TOO_DEEP`.

---

## 3. Hai lỗ hổng phát sinh — do QA tìm ra, đã vá

QA được giao nhiệm vụ **cố tình đánh sập** bản sửa. Nó tìm được 3 điểm; 2 điểm nằm trong phạm vi
yêu cầu nên đã vá, 1 điểm ghi nhận là nợ kỹ thuật.

### D3 — Junction/symlink vẫn thoát root (đã vá)
`safeProjectPath` đời đầu chỉ so khớp **chuỗi** nên một junction đặt trong project trỏ ra ngoài
vẫn lọt. QA chứng minh **không cần quyền admin**:
`fs.symlinkSync('H:/AI', '<root>/link', 'junction')` → `validate <link>/x.json` **đọc được file
ngoài root**; `simulate --save-replay <link>/y.json` **ghi được file ngoài root**.
→ Đã thêm lớp kiểm tra đường dẫn thật (mục 1, lớp 2). Giờ cả đọc lẫn ghi đều bị chặn, exit 1,
không file nào được tạo ngoài root.

### D1 — `simulate` vẫn crash thô (đã vá)
`simulate` gọi `lockBot()` hash thẳng, không validate, nên bot có `r: 0.5` làm CLI ném
`Error: canonicalJson: non-integer number 0.5 is not allowed` kèm stack trace — cùng lớp lỗi Bug 2,
chỉ khác đường gọi.
→ Đã bọc dispatch lệnh ở tầng CLI: lỗi in **một dòng** `error: <message>` ra stderr, `exit 1`,
không stack trace, không nuốt lặng. Sửa luôn lỗi UX: `validate ../../x.json` không còn in stack.

---

## 4. Nợ kỹ thuật còn lại (KHÔNG sửa, ghi nhận có chủ ý)

| # | Vấn đề | Đánh giá |
|---|---|---|
| D2 | `checkDefinition()` gọi **trực tiếp** từ library với cây lồng 50k → tràn stack ở `condDepth`/`walkCond` | **Không reachable từ CLI** (`validateBot` chạy `guardStructure` trước). Chỉ rủi ro cho library caller. Sửa sẽ phải đụng 3 hàm đệ quy trong `brain/validate.ts` — ngoài phạm vi. |
| D4 | Junction trỏ tới target **không tồn tại** ngoài root: `safeProjectPath` cho phép (realpath fail → fallback chuỗi), nhưng ghi qua nó ném `ENOENT`, không tạo gì ngoài | TOCTOU lý thuyết, hiện **không khai thác được**. Muốn bịt phải kiểm tra reparse point từng thành phần — phức tạp, không tương xứng. |

Cả hai đều cần kẻ tấn công **đã có quyền ghi vào trong project** thì mới dựng được tiền đề.

---

## 5. Bằng chứng nghiệm thu

| Kiểm tra | Kết quả |
|---|---|
| `npm run build` (`tsc -b`) | exit 0, không lỗi |
| Test suite | **125/125 PASS**, 0 fail, 0 skipped (trước khi sửa: 105) |
| 5 hash bot mẫu | **0 sai lệch** so với baseline |
| `hash100 --seeds 100` | `3bebc8f47d6146917bab1032a82d60d50a7ff97465c7511fecce1b47a7219832` — y hệt baseline |
| **Linux (Docker, node:22-alpine v22.23.2)** | digest **trùng khớp** Windows → cổng tất định xuyên nền tảng M1 vẫn đạt sau khi sửa `canonical.ts` |
| `npm run check` (build + test qua entry point dự án) | 125/125 PASS |
| Junction đọc ngoài root | `exit 1`, lỗi 1 dòng, **0 stack trace**, không đọc được |
| Junction ghi ngoài root | `exit 1`, **file thoát ra: KHÔNG** |
| 5 input crash cũ (float/NaN/Infinity/undefined) | **0 throw**, tất cả `ok=false` + sentinel |
| False positive (22 case) | **0** — kể cả junction nội bộ và root là junction |
| Test cũ bị xoá/yếu đi | không có |

---

## 6. File thay đổi

**Tạo mới**
- `packages/cli/src/paths.ts` — `safeProjectPath` + `ProjectPathError`
- `packages/cli/test/paths.test.ts` — 8 test (5 case yêu cầu + sibling-prefix, absolute trong root, Windows variants, junction)
- `packages/cli/test/cli.test.ts` — 2 test spawn CLI thật
- `packages/core/test/validation.test.ts` — 10 test

**Sửa**
- `packages/cli/src/index.ts` — áp helper cho mọi đường dẫn; bọc dispatch trong try/catch
- `packages/cli/tsconfig.json` — include `test/**/*.ts`
- `package.json` — test script chạy cả core lẫn cli
- `packages/core/src/validation/validate.ts` — guard cấu trúc, sentinel, `BOT_UNHASHABLE`
- `packages/contracts/src/canonical.ts` — trần đệ quy 1024

---

## 7. Việc nên làm tiếp

1. Cân nhắc bịt D2 nếu `@promptchien/core` sẽ được dùng như thư viện cho caller bên ngoài.
2. Ghi lại quy ước mới vào tài liệu dự án: **mọi đường dẫn CLI đi qua `safeProjectPath`**, và
   **không bao giờ hash một definition trước khi kiểm tra cấu trúc**.
3. Cân nhắc thêm bước xác thực (validate) trước khi `lockBot` trong luồng `simulate`, nếu muốn
   CLI từ chối bot không hợp lệ thay vì chỉ báo lỗi sạch.
