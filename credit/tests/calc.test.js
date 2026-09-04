const fs=require('fs');
global.window=global; global.Intl=Intl;
eval(fs.readFileSync(__dirname+'/../js/util.js','utf8'));
eval(fs.readFileSync(__dirname+'/../js/calc.js','utf8'));
global.DB={data:{settings:{currency:'₽'}}};
let ok=0,bad=0;
function eq(name,a,b,tol){tol=tol||0.01; if(Math.abs(a-b)<=tol){ok++;console.log('  ✓',name);}else{bad++;console.log('  ✗',name,'получено',a,'ожидалось',b);}}

// 1. Простой заём: 100 000, 10% в месяц (30 дн), выдан 60 дней назад, без платежей
const t=U.today();
const L1={id:'1',principal:100000,issuedAt:U.addDays(t,-60),model:'simple',rate:10,ratePeriod:'month',dueAt:U.addDays(t,30),payments:[],status:'active',penaltyRate:0};
let r=CALC.at(L1,t);
console.log('Тест 1 — 100 000 под 10%/мес, прошло 60 дней:');
eq('начислено процентов = 20 000',r.interestAccrued,20000);
eq('к возврату сегодня = 120 000',r.totalDue,120000);
eq('в день начисляется 333,33',r.dailyAccrual,333.333,0.01);
eq('просрочки нет',r.isOverdue?1:0,0);

// 2. Частичный платёж: гасим проценты + часть тела
const L2=JSON.parse(JSON.stringify(L1));
L2.payments=[{id:'p1',date:U.addDays(t,-30),amount:30000}];
r=CALC.at(L2,t);
console.log('Тест 2 — платёж 30 000 на 30-й день (проценты 10 000 + тело 20 000):');
eq('проценты уплачены 10 000',r.paidInterest,10000);
eq('тело погашено 20 000',r.paidPrincipal,20000);
eq('остаток тела 80 000',r.balance,80000);
eq('проценты за 2-й месяц на остаток 80 000 = 8 000',r.interestDue,8000);
eq('всего к возврату 88 000',r.totalDue,88000);
eq('прибыль получена 10 000',r.profit,10000);

// 3. Просрочка + пеня 1% в день
const L3={id:'3',principal:50000,issuedAt:U.addDays(t,-40),model:'simple',rate:10,ratePeriod:'month',
  dueAt:U.addDays(t,-10),penaltyRate:1,payments:[],status:'active'};
r=CALC.at(L3,t);
console.log('Тест 3 — просрочка 10 дней, пеня 1%/день:');
eq('дней просрочки = 10',r.overdueDays,10);
eq('пеня = 50 000 × 1% × 10 = 5 000',r.penaltyDue,5000);
eq('проценты за 40 дней = 6 666,67',r.interestAccrued,6666.67,0.02);
eq('флаг просрочки',r.isOverdue?1:0,1);

// 3b. То же, но проценты после срока не начисляются
const L3b=Object.assign({},L3,{stopAccrual:true});
r=CALC.at(L3b,t);
eq('проценты только за 30 дней = 5 000',r.interestAccrued,5000);
eq('пеня та же = 5 000',r.penaltyDue,5000);

// 4. Фиксированная сумма возврата
const L4={id:'4',principal:100000,returnAmount:130000,issuedAt:U.addDays(t,-5),model:'fixed',
  dueAt:U.addDays(t,25),payments:[],status:'active',penaltyRate:0};
r=CALC.at(L4,t);
console.log('Тест 4 — взял 100 000, вернёт 130 000:');
eq('к возврату 130 000',r.totalDue,130000);
eq('прибыль заложена 30 000',r.interestDue,30000);

// 5. Полное погашение закрывает заём
const L5={id:'5',principal:10000,issuedAt:U.addDays(t,-30),model:'simple',rate:10,ratePeriod:'month',
  dueAt:t,payments:[{id:'x',date:t,amount:11000}],status:'active',penaltyRate:0};
r=CALC.at(L5,t);
console.log('Тест 5 — 10 000 под 10%/мес, вернул 11 000 ровно в срок:');
eq('долг закрыт',r.rawDue,0);
eq('заём считается погашенным',r.isPaidOff?1:0,1);
eq('чистая прибыль 1 000',r.profit,1000);

// 6. Портфель
const P=CALC.portfolio([L1,L2,L3,L4,L5]);
console.log('Тест 6 — сводка по портфелю из 5 займов:');
eq('выдано всего 360 000',P.issuedTotal,360000);
eq('просрочен 1',P.overdueCount,1);
eq('реализованная прибыль 11 000',P.profitRealized,11000);

// 7. Переплата не уходит в минус
const L7={id:'7',principal:1000,issuedAt:t,model:'simple',rate:0,ratePeriod:'month',dueAt:t,
  payments:[{id:'y',date:t,amount:5000}],status:'active',penaltyRate:0};
r=CALC.at(L7,t);
console.log('Тест 7 — переплата 5 000 при долге 1 000:');
eq('долг не отрицательный',r.rawDue,0);
eq('переплата 4 000 отмечена',r.overpay,4000);

// 8. Даты
console.log('Тест 8 — даты:');
eq('31 января + 1 месяц = 28/29 февраля',U.parse(U.addMonths('2026-01-31',1))===U.parse('2026-02-28')?1:0,1);
eq('разница в днях через високосный февраль',U.diffDays('2024-02-28','2024-03-01'),2);

console.log('\nИтог: '+ok+' пройдено, '+bad+' провалено');
process.exit(bad?1:0);
