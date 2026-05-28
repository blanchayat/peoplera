(function(){
  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function onVisible(el){
    el.classList.add('on');
  }

  function initReveal(){
    const els = Array.from(document.querySelectorAll('.fade-in'));
    if (prefersReduced){
      els.forEach(onVisible);
      return;
    }
    const io = new IntersectionObserver((entries)=>{
      for (const e of entries){
        if (e.isIntersecting){
          onVisible(e.target);
          io.unobserve(e.target);
        }
      }
    },{threshold:0.12});
    els.forEach(el=>io.observe(el));
  }

  initReveal();
})();
