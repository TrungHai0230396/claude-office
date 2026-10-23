// Sai người đi chơi bằng lời: lời nhờ cuối của phiên là một câu ngắn kiểu "đi ngồi công viên",
// "đi ra lấy cf", "vô ghế làm việc" thì lúc nghỉ người đó tới đúng chỗ ấy và ở yên, không đi lung tung.
// Hàm thuần (không cần three) để kiểm bằng node --test.

// Câu sai việc thì ngắn và có động từ đi lại; lời nhờ làm việc thường dài hơn nhiều.
const DAI_TOI_DA = 60;
const DONG_TU = /\b(di|ra|vo|vao|ve|lai|qua|sang|lay|ngoi|uong|pha|dao|nam|dung)\b/;

// Thứ tự quan trọng: "ghế đá" phải bắt trước "ghế", "bàn cao" trước "bàn".
// 'ban' là ngồi nghỉ ở bàn mình.
const LUAT = [
  ['gheDa', /\b(cong vien|ghe da)\b/],
  ['vong', /\b(dao|di bo|vuon)\b/],
  ['sofa', /\bso ?fa\b/],
  ['cayNuoc', /\b(cay nuoc|uong nuoc|nuoc loc)\b/],
  ['banCao', /\b(ban cao|tan gau|noi chuyen)\b/],
  ['mayPha', /\b(ca ?phe|cafe|coffee|cf)\b/],
  ['ban', /\b((ve|vo|vao|ngoi) (ghe|ban|cho)|ghe lam viec|ban lam viec)\b/],
];

export function boDau(chu) {
  return String(chu || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Trả về chỗ muốn tới: 'gheDa' | 'vong' | 'sofa' | 'cayNuoc' | 'banCao' | 'mayPha' | 'ban', hoặc null.
export function lenhNghi(chu) {
  const s = boDau(chu);
  if (!s || s.length > DAI_TOI_DA || !DONG_TU.test(s)) return null;
  for (const [cho, mau] of LUAT) if (mau.test(s)) return cho;
  return null;
}
