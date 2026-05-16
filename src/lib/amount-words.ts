// Indian numbering: Lakhs/Crores. Returns "Rupees X and paise Y only".
const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ones[n];
  const t = Math.floor(n / 10), o = n % 10;
  return tens[t] + (o ? " " + ones[o] : "");
}
function threeDigits(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  return (h ? ones[h] + " Hundred" + (r ? " " : "") : "") + (r ? twoDigits(r) : "");
}

export function amountInWords(amount: number): string {
  if (!isFinite(amount)) return "";
  const sign = amount < 0 ? "Minus " : "";
  const abs = Math.abs(amount);
  const rupees = Math.floor(abs);
  const paise = Math.round((abs - rupees) * 100);

  const parts: string[] = [];
  const crore = Math.floor(rupees / 10000000);
  const lakh  = Math.floor((rupees % 10000000) / 100000);
  const thou  = Math.floor((rupees % 100000) / 1000);
  const rest  = rupees % 1000;

  if (crore) parts.push(twoDigits(crore) + " Crore");
  if (lakh)  parts.push(twoDigits(lakh) + " Lakh");
  if (thou)  parts.push(twoDigits(thou) + " Thousand");
  if (rest)  parts.push(threeDigits(rest));
  if (parts.length === 0) parts.push("Zero");

  let words = "Rupees " + parts.join(" ");
  if (paise) words += " and " + twoDigits(paise) + " Paise";
  return sign + words + " Only";
}