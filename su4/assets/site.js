(function(){
  var d=document, w=window;
  /* без скрипта появление блоков не включается: контент виден сразу */
  d.documentElement.classList.add('js');
  /* плавное появление страницы и мягкий уход при переходе */
  (function(){
    var html=d.documentElement;
    html.classList.add('page-enter');
    setTimeout(function(){html.classList.remove('page-enter');},420);
    if(w.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    d.addEventListener('click',function(e){
      var a=e.target.closest&&e.target.closest('a[href]'); if(!a||a.target==='_blank') return;
      var href=a.getAttribute('href')||'';
      if(/^(mailto:|tel:|#)/.test(href) || href==='' ) return;
      var internal=/\.html($|[#?])/.test(href)||/^\.\.?\//.test(href)||(a.href&&a.href.indexOf(location.origin)===0);
      if(!internal) return;
      if(a.href.split('#')[0]===location.href.split('#')[0]) return;   /* якорь на той же странице */
      if(e.metaKey||e.ctrlKey||e.shiftKey||e.button!==0) return;
      e.preventDefault(); html.classList.add('page-leave');
      var go=a.href, top=a.getAttribute('target')==='_top';
      setTimeout(function(){
        if(top){ try{ w.top.location.href=go; return; }catch(err){} }
        location.href=go;
      },200);
    });
    w.addEventListener('pageshow',function(ev){ if(ev.persisted) html.classList.remove('page-leave'); });
  })();
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

  /* фоновое видео первого экрана.
     Постер показывается всегда; сам файл грузим только когда это уместно:
     не при экономии трафика, не при отключённой анимации и не на узких экранах,
     где полмегабайта платит пользователь мобильного интернета. */
  var calmMotion=w.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hv=d.getElementById('heroVideo');
  if(hv){
    var conn=navigator.connection||{}, saveData=conn.saveData===true,
        slow=/^(slow-)?2g$/.test(conn.effectiveType||'');
    if(!saveData && !slow && !calmMotion){
      ['webm','mp4'].forEach(function(fmt){
        var src=hv.getAttribute('data-'+fmt); if(!src) return;
        var el=d.createElement('source'); el.src=src; el.type='video/'+fmt; hv.appendChild(el);
      });
      hv.preload='auto'; hv.load();
      var go=hv.play(); if(go&&go.catch)go.catch(function(){});
      /* за пределами экрана видео останавливаем — не тратим батарею */
      if(w.IntersectionObserver){
        new IntersectionObserver(function(es){es.forEach(function(e){
          if(e.isIntersecting){var pl=hv.play(); if(pl&&pl.catch)pl.catch(function(){});}
          else hv.pause();
        });},{threshold:.05}).observe(hv);
      }
    }
  }

  /* «Назад»: сначала история браузера, иначе — родительский раздел.
     В предпросмотре истории может не быть, поэтому нужен запасной путь. */
  var KEY='su4:from';
  /* перед уходом на другую страницу запоминаем адрес и позицию прокрутки */
  d.addEventListener('click',function(e){
    var a=e.target.closest&&e.target.closest('a[href]'); if(!a) return;
    var href=a.getAttribute('href')||'';
    if(/^(#|mailto:|tel:|https?:)/.test(href) && href.indexOf(location.origin)!==0) return;
    try{ sessionStorage.setItem(KEY, JSON.stringify({url:location.href, y:w.scrollY})); }catch(err){}
  },true);

  var back=d.querySelector('.backbtn');
  if(back){
    back.addEventListener('click',function(){
      var parent=back.getAttribute('data-parent'), from=null;
      try{ from=JSON.parse(sessionStorage.getItem(KEY)||'null'); }catch(err){}
      /* 1) запомненный адрес той же страницы, откуда пришли */
      if(from && from.url && from.url!==location.href){
        try{ sessionStorage.setItem('su4:restore', JSON.stringify(from)); }catch(err){}
        location.href=from.url; return;
      }
      /* 2) история браузера */
      if(w.history.length>1 && d.referrer && d.referrer!==location.href){
        var was=location.href; w.history.back();
        setTimeout(function(){ if(location.href===was && parent) location.href=parent; },400);
      } else if(parent){ location.href=parent; }
    });
  }
  /* вернулись назад — восстанавливаем прокрутку */
  (function(){
    var r=null; try{ r=JSON.parse(sessionStorage.getItem('su4:restore')||'null'); sessionStorage.removeItem('su4:restore'); }catch(err){}
    if(r && r.url && r.url.split('#')[0]===location.href.split('#')[0] && r.y>0 && !location.hash){
      w.addEventListener('load',function(){ w.scrollTo(0,r.y); });
    }
  })();

  /* header */
  var header=d.getElementById('header');
  if(header){
    /* над видео шапка прозрачная; на странице без тёмного первого экрана — сразу светлая */
    var hasHero=!!d.querySelector('.hero, .case-hero');
    var onScroll=function(){header.classList.toggle('is-scrolled', !hasHero || w.scrollY>24);};
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

  /* полоса прочтения и кнопка «наверх»: страница длинная, нужен ориентир */
  var bar2=d.createElement('div'); bar2.className='progress'; d.body.appendChild(bar2);
  var top=d.createElement('button'); top.className='totop'; top.type='button';
  top.setAttribute('aria-label','Наверх');
  top.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  top.addEventListener('click',function(){w.scrollTo({top:0,behavior:calmMotion?'auto':'smooth'});});
  d.body.appendChild(top);

  /* оглавление направлений: наведение меняет превью справа */
  var pv=d.querySelector('.dirs-preview'), cap=d.getElementById('dirsCap');
  if(pv){
    var pvImgs=pv.querySelectorAll('img');
    d.querySelectorAll('.dir[data-idx]').forEach(function(a){
      var show=function(){
        var i=a.getAttribute('data-idx');
        pvImgs.forEach(function(im){im.classList.toggle('on', im.getAttribute('data-for')===i);});
        if(cap) cap.textContent=(a.querySelector('.h3')||{}).textContent||'';
      };
      a.addEventListener('mouseenter',show); a.addEventListener('focus',show);
    });
  }

  /* показать остальные объекты: без перехода на отдельную страницу */
  var moreBtn=d.getElementById('moreProjects');
  if(moreBtn){
    moreBtn.addEventListener('click',function(){
      var rest=d.querySelectorAll('.plate--more');
      rest.forEach(function(e){e.hidden=false;});
      moreBtn.setAttribute('aria-expanded','true');
      moreBtn.remove(); moreBtn=null;
    });
  }

  function onProgress(){
    var h=d.documentElement.scrollHeight-w.innerHeight;
    bar2.style.width=(h>0?Math.min(100,w.scrollY/h*100):0)+'%';
    top.classList.toggle('show', w.scrollY>w.innerHeight);
  }
  onProgress(); w.addEventListener('scroll',onProgress,{passive:true});

  /* нижняя панель связи: появляется, когда первый экран уехал, и уходит у формы */
  var bar=d.getElementById('callbar'), contacts=d.getElementById('contacts')||d.getElementById('ask')||d.getElementById('discuss');
  if(bar){
    var toggleBar=function(){
      var past=w.scrollY>w.innerHeight*0.7;
      var atForm=contacts && contacts.getBoundingClientRect().top < w.innerHeight;
      bar.classList.toggle('show', past && !atForm);
    };
    toggleBar(); w.addEventListener('scroll',toggleBar,{passive:true});
  }

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

  /* фильтр объектов: счётчик у кнопки и строка результата */
  var fbtns=d.querySelectorAll('.filters button'), cards=d.querySelectorAll('#projectGrid .plate'),
      fnote=d.getElementById('filtersNote');
  function count(f){var n=0;cards.forEach(function(c){if(f==='all'||(c.getAttribute('data-cat')||'').split(' ').indexOf(f)>-1)n++;});return n;}
  function word(n){var a=n%10,b=n%100;return (a===1&&b!==11)?'объект':((a>1&&a<5)&&(b<10||b>20)?'объекта':'объектов');}
  if(fbtns.length){
    fbtns.forEach(function(b){
      var n=count(b.getAttribute('data-f')), c=d.createElement('span');
      c.className='cnt'; c.textContent=n; b.appendChild(c);
    });
    fbtns.forEach(function(b){b.addEventListener('click',function(){
      if(moreBtn){ d.querySelectorAll('.plate--more').forEach(function(e){e.hidden=false;}); moreBtn.remove(); moreBtn=null; }
      fbtns.forEach(function(x){x.setAttribute('aria-pressed',x===b)});
      var f=b.getAttribute('data-f'), n=0;
      cards.forEach(function(c){
        var ok=f==='all'||(c.getAttribute('data-cat')||'').split(' ').indexOf(f)>-1;
        c.classList.toggle('hidden',!ok); if(ok)n++;
      });
      if(fnote) fnote.textContent=(f==='all'?'Показаны все объекты — ':'Показано ')+n+' '+word(n);
      /* если сетка ушла вверх за шапку — подтягиваем её обратно в кадр */
      var grid=d.getElementById('projectGrid');
      if(grid){var t=grid.getBoundingClientRect().top; if(t<64||t>w.innerHeight*.6) w.scrollTo({top:grid.getBoundingClientRect().top+w.scrollY-96,behavior:'smooth'});}
    })});
  }

  /* просмотр фотографий: открыть кадр целиком, увеличить, листать */
  (function(){
    var groups={}, all=[];
    d.querySelectorAll('[data-zoom]').forEach(function(fig){
      var img=fig.querySelector('img'); if(!img) return;
      var g=fig.getAttribute('data-zoom')||'all';
      var capEl=fig.querySelector('.h3, h3, figcaption, .cap');
      var item={src:img.getAttribute('src'), alt:img.getAttribute('alt')||'', cap:(capEl?capEl.textContent.trim():'')||img.getAttribute('alt')||''};
      (groups[g]=groups[g]||[]).push(item);
      var frame=fig.querySelector('.ph-frame')||fig;
      frame.classList.add('zoomable'); frame.setAttribute('tabindex','0'); frame.setAttribute('role','button');
      frame.setAttribute('aria-label','Открыть фотографию'+(item.cap?': '+item.cap:''));
      var mark=d.createElement('span'); mark.className='zoom-mark'; mark.setAttribute('aria-hidden','true');
      mark.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/></svg>';
      frame.appendChild(mark);
      var idx=groups[g].length-1;
      function open(e){e.preventDefault(); show(g,idx);}
      frame.addEventListener('click',open);
      frame.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' ')open(e);});
      all.push(item);
    });
    if(!all.length) return;
    var box=d.createElement('div'); box.className='lightbox'; box.setAttribute('role','dialog');
    box.setAttribute('aria-modal','true'); box.setAttribute('aria-label','Просмотр фотографии');
    box.innerHTML='<div class="lightbox-bar"><span class="lightbox-count"></span><span class="lightbox-cap"></span>'+
      '<button type="button" class="close" aria-label="Закрыть"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>'+
      '<div class="lightbox-stage">'+
      '<button type="button" class="nav-prev" aria-label="Предыдущая"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg></button>'+
      '<img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==">'+
      '<button type="button" class="nav-next" aria-label="Следующая"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg></button>'+
      '</div>';
    d.body.appendChild(box);
    var lbImg=box.querySelector('img'), lbCap=box.querySelector('.lightbox-cap'),
        lbCnt=box.querySelector('.lightbox-count'), cur=[], i=0, opener=null;
    function render(){
      var it=cur[i]; if(!it) return;
      lbImg.classList.remove('zoomed'); lbImg.src=it.src; lbImg.alt=it.alt;
      lbCap.textContent=it.cap; lbCnt.textContent=(i+1)+' / '+cur.length;
      var many=cur.length>1;
      box.querySelector('.nav-prev').hidden=!many; box.querySelector('.nav-next').hidden=!many;
    }
    function show(g,n){ cur=groups[g]||all; i=n||0; opener=d.activeElement; box.classList.add('open'); d.documentElement.style.overflow='hidden'; render(); box.querySelector('.close').focus(); }
    function close(){ box.classList.remove('open'); d.documentElement.style.overflow=''; if(opener&&opener.focus)opener.focus(); }
    function step(k){ i=(i+k+cur.length)%cur.length; render(); }
    box.querySelector('.close').addEventListener('click',close);
    box.querySelector('.nav-prev').addEventListener('click',function(e){e.stopPropagation();step(-1)});
    box.querySelector('.nav-next').addEventListener('click',function(e){e.stopPropagation();step(1)});
    lbImg.addEventListener('click',function(e){e.stopPropagation(); lbImg.classList.toggle('zoomed');});
    box.addEventListener('click',function(e){ if(e.target===box||e.target.classList.contains('lightbox-stage')) close(); });
    d.addEventListener('keydown',function(e){
      if(!box.classList.contains('open')) return;
      if(e.key==='Escape')close(); else if(e.key==='ArrowLeft')step(-1); else if(e.key==='ArrowRight')step(1);
    });
  })();

  /* форма — демонстрация */
  var form=d.getElementById('leadForm');
  if(form)form.addEventListener('submit',function(e){
    e.preventDefault();
    if(!form.checkValidity()){form.reportValidity();return;}
    form.classList.add('sent');
  });
})();
