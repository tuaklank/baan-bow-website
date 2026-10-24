// เลขที่เอกสาร: prefix + ddmmyy(พ.ศ.) + เลขรัน 3 หลัก ต่อเนื่องตลอด แยกตามประเภท
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDocNo, parseDocNo, nextRunningNo } from '../src/numbering.js';

test('ประกอบเลขที่ตรงกับตัวอย่างในแม่แบบ', () => {
  assert.equal(formatDocNo('quotation', '2026-10-06', 5), 'QT061069005');
});

test('คำนำหน้าแยกตามประเภทเอกสาร', () => {
  assert.equal(formatDocNo('quotation', '2026-10-18', 1), 'QT181069001');
  assert.equal(formatDocNo('receipt', '2026-10-18', 1), 'RC181069001');
  assert.equal(formatDocNo('tax_invoice', '2026-10-18', 1), 'TI181069001');
  assert.equal(formatDocNo('receipt_tax_invoice', '2026-10-18', 1), 'RT181069001');
});

test('เลขรันเติมศูนย์ให้ครบ 3 หลัก', () => {
  assert.equal(formatDocNo('receipt', '2026-10-18', 1), 'RC181069001');
  assert.equal(formatDocNo('receipt', '2026-10-18', 42), 'RC181069042');
  assert.equal(formatDocNo('receipt', '2026-10-18', 999), 'RC181069999');
});

test('เกิน 999 แล้วยาวขึ้นเอง ไม่ตัดหลักทิ้ง (เลขไม่ซ้ำตลอดอายุระบบ)', () => {
  assert.equal(formatDocNo('receipt', '2026-10-18', 1000), 'RC1810691000');
  // ถ้าตัดเป็น 3 หลักจะได้ RC181069000 ซึ่งชนกับใบที่ 1000 ใบถัดไปเรื่อยๆ
  assert.notEqual(formatDocNo('receipt', '2026-10-18', 1000), 'RC181069000');
  assert.notEqual(
    formatDocNo('receipt', '2026-10-18', 1000),
    formatDocNo('receipt', '2026-10-18', 2000),
  );
});

test('เลขรันไม่รีเซ็ตรายวัน — วันต่างกันเลขรันเดินต่อ', () => {
  // วันที่ในเลขคือวันออกเอกสาร ส่วนเลขรันเดินต่อจากของเดิมเสมอ
  assert.equal(formatDocNo('quotation', '2026-10-18', 7), 'QT181069007');
  assert.equal(formatDocNo('quotation', '2026-10-19', 8), 'QT191069008');
});

test('เลขรันไม่ถูกต้อง ถูกปฏิเสธ', () => {
  assert.throws(() => formatDocNo('quotation', '2026-10-18', 0), /เลขรัน/);
  assert.throws(() => formatDocNo('quotation', '2026-10-18', -1), /เลขรัน/);
  assert.throws(() => formatDocNo('quotation', '2026-10-18', 1.5), /เลขรัน/);
  assert.throws(() => formatDocNo('invoice', '2026-10-18', 1), /ประเภทเอกสารไม่ถูกต้อง/);
});

test('parseDocNo แกะเลขที่กลับได้ และไม่สนตัวพิมพ์เล็กใหญ่', () => {
  assert.deepEqual(parseDocNo('QT061069005'), {
    type: 'quotation', prefix: 'QT', ddmmyy: '061069', n: 5, doc_no: 'QT061069005',
  });
  assert.equal(parseDocNo('  qt061069005 ').doc_no, 'QT061069005');
  assert.equal(parseDocNo('RT1810691000').n, 1000);
});

test('parseDocNo คืน null เมื่อไม่ใช่เลขที่เอกสาร', () => {
  assert.equal(parseDocNo('โตโยต้าพัทยา'), null);
  assert.equal(parseDocNo('XX181069001'), null);
  assert.equal(parseDocNo('QT18106900'), null);     // สั้นไป
  assert.equal(parseDocNo(''), null);
  assert.equal(parseDocNo(null), null);
});

test('nextRunningNo ออกเลขด้วยคำสั่งเดียวแบบ atomic และนับต่อจากค่าในตาราง counters', async () => {
  // D1 ปลอม: เก็บ counters ใน Map แล้วทำ INSERT..ON CONFLICT DO UPDATE n=n+1 RETURNING n
  const counters = new Map([['quotation', 4]]);   // ตั้งเลขเริ่มต้นไว้ที่ 4 ใบถัดไปต้องได้ 5
  let statements = 0;
  const db = {
    prepare(sql) {
      assert.match(sql, /ON CONFLICT\(key\) DO UPDATE SET n = n \+ 1 RETURNING n/);
      return {
        bind(key) {
          return {
            async first() {
              statements++;
              counters.set(key, (counters.get(key) ?? 0) + 1);
              return { n: counters.get(key) };
            },
          };
        },
      };
    },
  };

  assert.equal(await nextRunningNo(db, 'quotation'), 5);
  assert.equal(await nextRunningNo(db, 'quotation'), 6);
  assert.equal(await nextRunningNo(db, 'receipt'), 1);        // แยกตามประเภท เริ่มที่ 1
  assert.equal(await nextRunningNo(db, 'quotation'), 7);
  assert.equal(statements, 4);                               // 1 คำสั่งต่อ 1 เลข ไม่มี read-then-write
  assert.equal(formatDocNo('quotation', '2026-10-06', 5), 'QT061069005');
});

test('nextRunningNo ปฏิเสธประเภทที่ไม่รู้จัก ก่อนแตะฐานข้อมูล', async () => {
  const db = { prepare() { throw new Error('ไม่ควรถูกเรียก'); } };
  await assert.rejects(() => nextRunningNo(db, 'invoice'), /ประเภทเอกสารไม่ถูกต้อง/);
});
