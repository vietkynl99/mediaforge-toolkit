# Hướng dẫn chỉnh sửa tham số RenderConfigV2

Tài liệu này hướng dẫn quy trình từng bước để thêm hoặc sửa đổi một tham số trong cấu trúc `RenderConfigV2` của MediaForge Toolkit, dựa trên ví dụ thực tế khi triển khai thuộc tính `visible`.

---

## Tổng quan quy trình

Việc thay đổi cấu hình render yêu cầu cập nhật đồng bộ ở 4 khu vực chính:
1. **Schema**: Định nghĩa kiểu dữ liệu dùng chung.
2. **Backend**: Xử lý logic render thực tế (FFmpeg).
3. **App State**: Quản lý dữ liệu, đồng bộ hóa và xử lý template.
4. **UI**: Giao diện điều khiển cho người dùng.

---

## Bước 1: Cập nhật Schema (`shared/types.ts`)

Mọi thay đổi bắt đầu từ việc định nghĩa thuộc tính mới trong interface/type.

- **Vị trí**: `shared/types.ts`
- **Hành động**: Thêm thuộc tính vào `RenderItemV2` hoặc `RenderConfigV2`.
- **Lưu ý**: Sử dụng JSDoc để giải thích ý nghĩa và giá trị mặc định.

```typescript
export type RenderItemV2 = {
  // ...
  /**
   * Giải thích ý nghĩa thuộc tính.
   * Mặc định là true nếu không có.
   */
  visible?: boolean; 
  // ...
}
```

---

## Bước 2: Xử lý logic tại Server (`server/index.ts`)

Sau khi có schema, cần cập nhật pipeline render để thực thi logic của tham số mới.

- **Vị trí**: `server/index.ts` (thường trong hàm `buildRenderV2FilterGraph`).
- **Hành động**: Sử dụng tham số để lọc hoặc biến đổi các item trước khi đưa vào filter graph của FFmpeg.
- **Kỹ thuật**: Tạo các helper function (như `isVisible`) để code sạch sẽ hơn.

```typescript
const isVisible = (item: RenderItemV2) => item.visible !== false;
const visualItems = items.filter(item => (item.type === 'video' || item.type === 'image') && isVisible(item));
```

---

## Bước 3: Quản lý State tại Frontend (`App.tsx`)

Đây là nơi phức tạp nhất vì cần xử lý cả state hiện tại và cơ chế Template.

### 3.1. Khai báo State
Thêm state mới để lưu trữ giá trị tạm thời trong UI.
```typescript
const [renderTrackVisible, setRenderTrackVisible] = useState<Record<string, boolean>>({});
```

### 3.2. Cập nhật hàm `buildRenderConfigV2`
Hàm này chịu trách nhiệm đóng gói toàn bộ state thành object `RenderConfigV2` chuẩn để gửi lên server hoặc lưu template.
- **Quy tắc**: Luôn ưu tiên giá trị tường minh (explicit `true`/`false`) thay vì `undefined` để tránh lỗi "missing field" khi so sánh thay đổi (dirty detection).

```typescript
visible: trackIsVisible !== false // Luôn ra true hoặc false
```

### 3.3. Xử lý khôi phục từ Template (`applyRenderTemplate`)
Khi người dùng chọn một template, cần trích xuất giá trị từ các `items` trong template đó để cập nhật ngược lại vào UI state.

### 3.4. Reset State
Đảm bảo xóa/reset giá trị khi chuyển dự án hoặc bấm "Reset to Default".

---

## Bước 4: Xử lý Template & Dirty Detection (`config-builder.ts`)

File này đảm nhiệm việc chuẩn hóa dữ liệu để so sánh xem người dùng đã thay đổi gì so với template gốc.

- **Vị trí**: `src/features/render-studio/utils/config-builder.ts`
- **Hành động**: Trong hàm `buildTemplateFromConfig`, quyết định xem có cần loại bỏ hoặc biến đổi tham số nào để việc so sánh `JSON.stringify` chính xác không.
- **Lưu ý**: Nếu bạn muốn tham số luôn hiện diện trong bảng "Show Changes", **không** được xóa nó trong quá trình normalization.

---

## Bước 5: Triển khai giao diện UI (`RenderStudioPage.tsx`)

Cuối cùng, thêm các control (nút bấm, checkbox, input) để người dùng tương tác.

- **Vị trí**: `src/features/render-studio/legacy/RenderStudioPage.tsx` (hoặc các component con).
- **Hành động**: 
    - Destructure state và hàm update từ props.
    - Render icon/button tương ứng (ví dụ: `Eye`, `EyeOff` từ `lucide-react`).
    - Thêm phản hồi trực quan (Visual Feedback), ví dụ: giảm opacity của track khi bị ẩn.

---

## Bước 6: Cập nhật Preview Dependencies (`App.tsx`)

Để đảm bảo khi người dùng thay đổi tham số, bản xem trước (Preview) được cập nhật ngay lập tức, bạn phải thêm state mới vào mảng dependencies của `renderConfigPreviewForPreview`.

- **Vị trí**: `App.tsx`, tìm `const renderConfigPreviewForPreview = useMemo(...)`.
- **Hành động**: Thêm state của bạn vào cuối mảng dependencies.

```typescript
  const renderConfigPreviewForPreview = useMemo(() => {
    // ...
  }, [
    // ... các deps khác
    renderTrackVisible // <--- Thêm vào đây
  ]);
```

---

## Các quy tắc "vàng" cần nhớ

1. **Boolean Tường Minh**: Tránh để giá trị `undefined` trong config cuối cùng. Hãy dùng `value !== false` để ép về `true/false`.
2. **Lọc dữ liệu**: Luôn kiểm tra loại track (video, audio, etc.) trước khi áp dụng tham số. Tránh thêm `visible` cho track `audio` nếu nó không được hỗ trợ.
3. **Dirty Detection**: Nếu một tham số mới làm hiện thông báo "Unsaved Changes" sai, hãy kiểm tra lại hàm `buildTemplateFromConfig`.
4. **JSDoc**: Luôn comment đầy đủ trong file `types.ts` để các developer khác (và AI) hiểu rõ mục đích của tham số.
