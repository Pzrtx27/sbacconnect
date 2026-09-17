const sizes = [
  { label: 'S (12 oz)', names: ['s', 'size s', 'แก้วเล็ก (s)', 'เล็ก 12 oz', 's (12 oz)'] },
  { label: 'M (16 oz)', names: ['m', 'size m', 'แก้วกลาง (m)', 'กลาง 16 oz', 'm (16 oz)'] },
  { label: 'L (22 oz)', names: ['l', 'size l', 'แก้วใหญ่ (l)', 'ใหญ่ 22 oz', 'l (22 oz)'] },
];

export function mergeCoffeeSizes(product) {
  return {
    ...product,
    option_groups: product.option_groups.map((group) => {
      if (!['ขนาด', 'ขนาดแก้ว', 'size'].includes(group.name.trim().toLowerCase())) return group;
      const options = [];
      for (const option of group.options) {
        const size = sizes.find((item) => item.names.includes(option.name.trim().toLowerCase()));
        if (!size) {
          options.push(option);
          continue;
        }
        const index = options.findIndex((item) => item.name === size.label);
        const normalized = { ...option, name: size.label };
        if (index < 0) options.push(normalized);
        // ชื่อรุ่น oz เป็นข้อมูลใหม่กว่า ใช้ id และราคาจริงของแถวนั้นเมื่อมีชื่อรุ่นเก่าซ้ำ
        else if (/oz/i.test(option.name)) options[index] = normalized;
      }
      return { ...group, options };
    }),
  };
}
