const zone = { timeZone: 'Asia/Shanghai' };
export function archiveDate(time: number) {
  const date = new Date(time);
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { ...zone, hour: '2-digit', hourCycle: 'h23' }).format(date),
  );
  const greeting =
    hour < 5 ? '夜深了' : hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
  const formatted = new Intl.DateTimeFormat('zh-CN', {
    ...zone,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
  const weekday = new Intl.DateTimeFormat('zh-CN', { ...zone, weekday: 'long' }).format(date);
  const lunarParts = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
    ...zone,
    month: 'long',
    day: 'numeric',
  }).formatToParts(date);
  const month = lunarParts.find((p) => p.type === 'month')?.value || '';
  const day = Number(lunarParts.find((p) => p.type === 'day')?.value || 1);
  const nums = '一二三四五六七八九十';
  const lunarDay =
    day <= 10
      ? `初${nums[day - 1]}`
      : day < 20
        ? `十${nums[day - 11]}`
        : day === 20
          ? '二十'
          : day < 30
            ? `廿${nums[day - 21]}`
            : '三十';
  return { greeting, formatted, weekday, lunar: `农历${month}${lunarDay}` };
}
