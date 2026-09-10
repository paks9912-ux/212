(function(){
  var d=document, w=window;
  /* годы считаем от 1952 */
  var now=new Date().getFullYear(), yrs=now-1952;
  ['years','years2'].forEach(function(id){var e=d.getElementById(id);if(e)e.textContent=yrs;});
  ['yearNow','yearNow2','yearNow3'].forEach(function(id){var e=d.getElementById(id);if(e)e.textContent=now;});
  d.querySelectorAll('[data-years]').forEach(function(e){e.textContent=yrs;});

  /* логотип: если файл не загрузился — показываем текстовый знак */
  d.querySelectorAll('[data-logo]').forEach(function(img){
    function fail(){img.closest('.logo').classList.add('no-img');}
    if(img.complete&&img.naturalWidth===0)fail();
    img.addEventListener('error',fail);
  });

  /* header */
  var header=d.getElementById('header');
  if(header){
    var onScroll=function(){header.classList.toggle('is-scrolled',w.scrollY>24);};
    onScroll(); w.addEventListener('scroll',onScroll,{passive:true});
  }

  /* mobile menu */
  var burger=d.getElementById('burger'), menu=d.getElementById('mobileMenu'), close=d.getElementById('mobileClose');
  if(burger&&menu&&close){
  function setMenu(open){menu.classList.toggle('open',open);menu.setAttribute('aria-hidden',!open);burger.setAttribute('aria-expanded',open);d.body.style.overflow=open?'hidden':'';}
  burger.addEventListener('click',function(){setMenu(true)});
  close.addEventListener('click',function(){setMenu(false)});
  menu.querySelectorAll('a').forEach(function(a){a.addEventListener('click',function(){setMenu(false)})});
  }

  /* placeholder-ссылки внутренних страниц */
  d.querySelectorAll('[data-placeholder-link]').forEach(function(a){
    a.setAttribute('title','Внутренняя страница — следующий этап');
    a.addEventListener('click',function(e){e.preventDefault();});
  });

  /* reveal: элементы ниже первого экрана появляются при скролле */
  var reduce=w.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var items=[].slice.call(d.querySelectorAll('.reveal'));
  if(reduce||!('IntersectionObserver' in w)){items.forEach(function(e){e.classList.add('in')});}
  else{
    var vh=w.innerHeight;
    items.forEach(function(e){if(e.getBoundingClientRect().top<vh*.9)e.classList.add('in');});
    var io=new IntersectionObserver(function(entries){entries.forEach(function(en){if(en.isIntersecting){en.target.classList.add('in');io.unobserve(en.target);}});},{rootMargin:'0px 0px -8% 0px'});
    items.forEach(function(e){if(!e.classList.contains('in'))io.observe(e);});
  }

  /* счётчики */
  function fmt(n){return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g,' ');}
  var counters=[].slice.call(d.querySelectorAll('[data-count]'));
  if(!reduce&&'IntersectionObserver' in w){
    var co=new IntersectionObserver(function(entries){entries.forEach(function(en){
      if(!en.isIntersecting)return; co.unobserve(en.target);
      var el=en.target, target=+el.getAttribute('data-count'), t0=performance.now(), dur=1400;
      (function tick(t){var p=Math.min(1,(t-t0)/dur), e=1-Math.pow(1-p,3); el.textContent=fmt(target*e); if(p<1)requestAnimationFrame(tick);})(t0);
    });},{threshold:.4});
    counters.forEach(function(c){co.observe(c)});
  }

  /* фильтр проектов */
  var fbtns=d.querySelectorAll('.filters button'), cards=d.querySelectorAll('#projectGrid .proj');
  fbtns.forEach(function(b){b.addEventListener('click',function(){
    fbtns.forEach(function(x){x.setAttribute('aria-pressed',x===b)});
    var f=b.getAttribute('data-f');
    cards.forEach(function(c){var ok=f==='all'||(c.getAttribute('data-cat')||'').split(' ').indexOf(f)>-1;c.classList.toggle('hidden',!ok);});
  })});

  /* форма — демонстрация */
  var form=d.getElementById('leadForm');
  if(form)form.addEventListener('submit',function(e){
    e.preventDefault();
    if(!form.checkValidity()){form.reportValidity();return;}
    form.classList.add('sent');
  });
})();
