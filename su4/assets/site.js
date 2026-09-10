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
      var tryPlay=function(){var go=hv.play(); if(go&&go.catch)go.catch(function(){});};
      tryPlay();
      /* часть телефонов запускает видео только после первого касания экрана */
      var once=function(){ if(hv.paused) tryPlay();
        d.removeEventListener('touchstart',once); d.removeEventListener('click',once); d.removeEventListener('scroll',once); };
      d.addEventListener('touchstart',once,{passive:true});
      d.addEventListener('click',once);
      d.addEventListener('scroll',once,{passive:true});
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

  /* переход по якорю — плавно и с поправкой на шапку */
  d.addEventListener('click',function(e){
    var a=e.target.closest&&e.target.closest('a[href^="#"]'); if(!a) return;
    var id=a.getAttribute('href').slice(1); if(!id) return;
    var t=d.getElementById(id); if(!t) return;
    e.preventDefault();
    var calm2=w.matchMedia('(prefers-reduced-motion: reduce)').matches;
    w.scrollTo({top:t.getBoundingClientRect().top+w.scrollY-72,behavior:calm2?'auto':'smooth'});
    if(history.replaceState) history.replaceState(null,'','#'+id);
  });

  /* reveal: элементы ниже первого экрана появляются при скролле */
  var reduce=w.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var items=[].slice.call(d.querySelectorAll('.reveal'));
  if(reduce||!('IntersectionObserver' in w)){items.forEach(function(e){e.classList.add('in')});}
  else{
    var vh=w.innerHeight;
    items.forEach(function(e){if(e.getBoundingClientRect().top<vh*.9)e.classList.add('in');});
    var io=new IntersectionObserver(function(entries){
      var k=0;
      entries.forEach(function(en){
        if(!en.isIntersecting) return;
        en.target.style.transitionDelay=(Math.min(k++,4)*70)+'ms';
        en.target.classList.add('in'); io.unobserve(en.target);
      });
    },{rootMargin:'0px 0px -8% 0px'});
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
      var f=b.getAttribute('data-f'), n=0, grid0=d.getElementById('projectGrid');
      if(grid0){ grid0.classList.add('swap'); setTimeout(function(){grid0.classList.remove('swap');},240); }
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

  /* просмотр фотографий: кадр целиком, увеличение с перемещением, листание
     колесом, свайпом и перетаскиванием */
  (function(){
    var groups={}, any=false;
    d.querySelectorAll('[data-zoom]').forEach(function(fig){
      var im=fig.querySelector('img'); if(!im) return;
      var g=fig.getAttribute('data-zoom')||'all';
      var capEl=fig.querySelector('.h3, h3, figcaption, .cap');
      var item={src:im.getAttribute('src'), alt:im.getAttribute('alt')||'',
                cap:(capEl?capEl.textContent.trim().split('\n')[0]:'')||im.getAttribute('alt')||''};
      (groups[g]=groups[g]||[]).push(item);
      var frame=fig.querySelector('.ph-frame')||fig, idx=groups[g].length-1;
      frame.classList.add('zoomable'); frame.setAttribute('tabindex','0'); frame.setAttribute('role','button');
      frame.setAttribute('aria-label','Открыть фотографию'+(item.cap?': '+item.cap:''));
      var mark=d.createElement('span'); mark.className='zoom-mark'; mark.setAttribute('aria-hidden','true');
      mark.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/></svg>';
      frame.appendChild(mark);
      frame.addEventListener('click',function(e){e.preventDefault(); open(g,idx);});
      frame.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault(); open(g,idx);}});
      any=true;
    });
    if(!any) return;

    var box=d.createElement('div'); box.className='lightbox'; box.setAttribute('role','dialog');
    box.setAttribute('aria-modal','true'); box.setAttribute('aria-label','Просмотр фотографии'); box.hidden=true;
    box.innerHTML=
      '<div class="lightbox-bar">'+
        '<span class="lightbox-count num"></span><span class="lightbox-cap"></span>'+
        '<button type="button" class="lb-zoom" aria-label="Увеличить"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6"/><path class="plus" d="M11 8v6"/></svg></button>'+
        '<button type="button" class="lb-close" aria-label="Закрыть"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></button>'+
      '</div>'+
      '<div class="lightbox-stage">'+
        '<button type="button" class="nav-prev" aria-label="Предыдущая фотография"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg></button>'+
        '<div class="lightbox-frame"><img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="></div>'+
        '<button type="button" class="nav-next" aria-label="Следующая фотография"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg></button>'+
      '</div>'+
      '<div class="lightbox-strip" role="tablist" aria-label="Все фотографии"></div>';
    d.body.appendChild(box);

    var frameEl=box.querySelector('.lightbox-frame'), img=box.querySelector('.lightbox-frame img'),
        capEl=box.querySelector('.lightbox-cap'), cntEl=box.querySelector('.lightbox-count'),
        strip=box.querySelector('.lightbox-strip'), prevBtn=box.querySelector('.nav-prev'),
        nextBtn=box.querySelector('.nav-next'), zoomBtn=box.querySelector('.lb-zoom'),
        list=[], i=0, opener=null, sc=1, tx=0, ty=0, MAX=3.2;
    var calm=w.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var down=false, sx=0, sy=0, ox=0, oy=0, moved=0;

    function apply(anim){
      img.style.transition=anim&&!calm?'transform .32s var(--ease)':'none';
      img.style.transform='translate3d('+tx+'px,'+ty+'px,0) scale('+sc+')';
      img.classList.toggle('is-zoomed', sc>1.01);
      zoomBtn.setAttribute('aria-label', sc>1.01?'Уменьшить':'Увеличить');
      zoomBtn.querySelector('.plus').style.opacity = sc>1.01?0:1;
    }
    function bounds(){
      var r=img.getBoundingClientRect(), st=frameEl.getBoundingClientRect();
      return {x:Math.max(0,(r.width-st.width)/2), y:Math.max(0,(r.height-st.height)/2)};
    }
    function clamp(){ var b=bounds(); tx=Math.max(-b.x,Math.min(b.x,tx)); ty=Math.max(-b.y,Math.min(b.y,ty)); }
    function reset(){ sc=1; tx=0; ty=0; apply(false); }
    function zoomTo(v,cx,cy){
      var old=sc; sc=Math.max(1,Math.min(MAX,v));
      if(sc===1){tx=0;ty=0;}
      else if(cx!=null){
        var st=frameEl.getBoundingClientRect(), dx=cx-(st.left+st.width/2), dy=cy-(st.top+st.height/2), k=sc/old;
        tx=(tx-dx)*k+dx*0; ty=(ty-dy)*k+dy*0; clamp();
      } else clamp();
      apply(true);
    }
    function render(dir){
      var it=list[i]; if(!it) return;
      if(dir&&!calm){
        img.style.transition='transform .18s var(--ease),opacity .18s var(--ease)';
        img.style.opacity='0'; img.style.transform='translate3d('+(dir>0?-40:40)+'px,0,0)';
      }
      var swap=function(){
        var pre=new Image();
        pre.onload=function(){
          img.src=it.src; img.alt=it.alt; reset();
          if(!calm){ img.style.opacity='0'; img.style.transform='translate3d('+(dir>0?36:-36)+'px,0,0)';
            requestAnimationFrame(function(){ img.style.transition='transform .34s var(--ease),opacity .28s var(--ease)';
              img.style.opacity='1'; img.style.transform='translate3d(0,0,0) scale(1)'; });
          } else img.style.opacity='1';
        };
        pre.src=it.src;
      };
      dir&&!calm ? setTimeout(swap,150) : swap();
      capEl.textContent=it.cap; cntEl.textContent=(i+1)+' / '+list.length;
      var many=list.length>1; prevBtn.hidden=!many; nextBtn.hidden=!many;
      [].forEach.call(strip.children,function(b,n){
        var on=n===i; b.setAttribute('aria-current',on);
        if(on&&b.scrollIntoView) b.scrollIntoView({inline:'center',block:'nearest',behavior:calm?'auto':'smooth'});
      });
    }
    function buildStrip(){
      strip.innerHTML='';
      if(list.length<2){strip.hidden=true;return;}
      strip.hidden=false;
      list.forEach(function(it,n){
        var b=d.createElement('button'); b.type='button'; b.setAttribute('aria-label','Фотография '+(n+1));
        b.innerHTML='<img src="'+it.src+'" alt="">';
        b.addEventListener('click',function(){ if(n===i)return; var dir=n>i?1:-1; i=n; render(dir); });
        strip.appendChild(b);
      });
    }
    function open(g,n){
      list=groups[g]||[]; i=n||0; opener=d.activeElement;
      box.hidden=false; buildStrip(); render(0);
      requestAnimationFrame(function(){ box.classList.add('open'); });
      d.documentElement.style.overflow='hidden';
      box.querySelector('.lb-close').focus();
    }
    function close(){
      box.classList.remove('open'); d.documentElement.style.overflow='';
      setTimeout(function(){ box.hidden=true; },calm?0:260);
      if(opener&&opener.focus)opener.focus();
    }
    function step(k){ if(list.length<2)return; i=(i+k+list.length)%list.length; render(k); }

    box.querySelector('.lb-close').addEventListener('click',close);
    prevBtn.addEventListener('click',function(e){e.stopPropagation();step(-1)});
    nextBtn.addEventListener('click',function(e){e.stopPropagation();step(1)});
    zoomBtn.addEventListener('click',function(){ zoomTo(sc>1.01?1:2.2); });
    /* закрытие по клику мимо кадра — но не после перетаскивания */
    box.addEventListener('click',function(e){
      if(moved>6) return;
      if(e.target===box||e.target.classList.contains('lightbox-stage')||e.target.classList.contains('lightbox-bar')) close();
    });
    img.addEventListener('dblclick',function(e){ e.preventDefault(); zoomTo(sc>1.01?1:2.4,e.clientX,e.clientY); });

    /* колесо: при увеличении — перемещение по кадру, иначе — листание */
    var wheelLock=0;
    frameEl.addEventListener('wheel',function(e){
      e.preventDefault();
      if(sc>1.01){ tx-=e.deltaX; ty-=e.deltaY; clamp(); apply(false); return; }
      var now=Date.now(); if(now-wheelLock<420) return;
      var d1=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;
      if(Math.abs(d1)<12) return;
      wheelLock=now; step(d1>0?1:-1);
    },{passive:false});

    /* перетаскивание: при увеличении двигаем кадр, иначе — листаем */
    frameEl.addEventListener('pointerdown',function(e){
      if(e.pointerType==='mouse'&&e.button!==0) return;
      down=true; moved=0; sx=e.clientX; sy=e.clientY; ox=tx; oy=ty;
      img.style.transition='none'; frameEl.setPointerCapture&&frameEl.setPointerCapture(e.pointerId);
    });
    frameEl.addEventListener('pointermove',function(e){
      if(!down) return;
      var dx=e.clientX-sx, dy=e.clientY-sy; moved=Math.max(moved,Math.abs(dx),Math.abs(dy));
      if(sc>1.01){ tx=ox+dx; ty=oy+dy; clamp(); apply(false); }
      else img.style.transform='translate3d('+dx*.55+'px,'+dy*.25+'px,0)';
    });
    function endDrag(e){
      if(!down) return; down=false;
      var dx=e.clientX-sx, dy=e.clientY-sy;
      if(sc>1.01) return;
      if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)) step(dx<0?1:-1);
      else if(dy>110) close();
      else { img.style.transition=calm?'none':'transform .28s var(--ease)'; img.style.transform='translate3d(0,0,0) scale(1)'; }
    }
    frameEl.addEventListener('pointerup',endDrag);
    frameEl.addEventListener('pointercancel',function(){down=false;});

    /* два пальца: масштаб щипком */
    var pts={}, baseDist=0, baseScale=1;
    frameEl.addEventListener('touchstart',function(e){
      if(e.touches.length===2){
        baseDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
        baseScale=sc; down=false;
      }
    },{passive:true});
    frameEl.addEventListener('touchmove',function(e){
      if(e.touches.length===2&&baseDist){
        e.preventDefault();
        var dist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
        sc=Math.max(1,Math.min(MAX,baseScale*(dist/baseDist))); if(sc===1){tx=0;ty=0;} clamp(); apply(false);
      }
    },{passive:false});
    frameEl.addEventListener('touchend',function(e){ if(e.touches.length<2) baseDist=0; },{passive:true});

    d.addEventListener('keydown',function(e){
      if(box.hidden) return;
      if(e.key==='Escape')close();
      else if(e.key==='ArrowLeft'){e.preventDefault();sc>1.01?(tx+=60,clamp(),apply(true)):step(-1);}
      else if(e.key==='ArrowRight'){e.preventDefault();sc>1.01?(tx-=60,clamp(),apply(true)):step(1);}
      else if(e.key==='ArrowUp'&&sc>1.01){e.preventDefault();ty+=60;clamp();apply(true);}
      else if(e.key==='ArrowDown'&&sc>1.01){e.preventDefault();ty-=60;clamp();apply(true);}
      else if(e.key==='+'||e.key==='='){zoomTo(sc+.6);}
      else if(e.key==='-'){zoomTo(sc-.6);}
    });
  })();

  /* телефон: на телефоне открывается цифровая клавиатура, +996 подставлен заранее */
  (function(){
    d.querySelectorAll('input[type="tel"]').forEach(function(inp){
      if(inp.closest('.tel-field')) return;
      var wrap=d.createElement('span'); wrap.className='tel-field';
      inp.parentNode.insertBefore(wrap,inp); wrap.appendChild(inp);
      var pre=d.createElement('span'); pre.className='tel-prefix'; pre.setAttribute('aria-hidden','true');
      pre.textContent='+996'; wrap.insertBefore(pre,inp);

      inp.setAttribute('inputmode','numeric');          /* цифровая клавиатура на телефоне */
      inp.setAttribute('autocomplete','tel-national');
      inp.setAttribute('placeholder','700 123 456');
      inp.setAttribute('maxlength','11');
      inp.setAttribute('aria-describedby',(inp.id||'f-phone')+'-hint');

      var hint=d.createElement('span'); hint.className='hint'; hint.id=(inp.id||'f-phone')+'-hint';
      hint.textContent='Девять цифр без кода страны';
      (inp.closest('.field')||wrap.parentNode).appendChild(hint);

      /* поле для отправки: полный номер в международном виде */
      var full=d.createElement('input'); full.type='hidden'; full.name=(inp.name||'phone')+'_full';
      wrap.appendChild(full);

      function digits(v){
        var n=(v||'').replace(/\D/g,'');
        if(n.indexOf('996')===0) n=n.slice(3);            /* вставили номер с кодом страны */
        if(n.charAt(0)==='0') n=n.slice(1);               /* привычная запись через ноль */
        return n.slice(0,9);
      }
      function pretty(n){
        return n.replace(/^(\d{3})(\d{0,3})(\d{0,3}).*$/,function(_,a,b,c){
          return a+(b?' '+b:'')+(c?' '+c:'');
        });
      }
      function sync(){
        var n=digits(inp.value);
        inp.value=pretty(n);
        full.value=n.length===9?('+996'+n):'';
        inp.setCustomValidity(!inp.required||n.length===9?'':'Введите девять цифр номера, например 700 123 456');
      }
      inp.addEventListener('input',function(){
        var atEnd=inp.selectionStart===inp.value.length;
        sync();
        if(atEnd&&inp.setSelectionRange) inp.setSelectionRange(inp.value.length,inp.value.length);
      });
      inp.addEventListener('blur',sync);
      inp.addEventListener('paste',function(){setTimeout(sync,0)});
      sync();
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
