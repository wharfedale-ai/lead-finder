// Light or dark: the saved choice, else the computer's setting. Runs in <head> so the page never flashes the wrong theme.
(function(){
  const root=document.documentElement;
  let saved=null;
  try{saved=localStorage.getItem('lead-finder-theme');}catch{}
  const prefersLight=window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches;
  root.dataset.theme=saved||(prefersLight?'light':'dark');
  document.addEventListener('DOMContentLoaded',()=>{
    const toggle=document.getElementById('theme-toggle');
    if(!toggle)return;
    const label=()=>toggle.setAttribute('aria-label',root.dataset.theme==='light'?'Switch to dark mode':'Switch to light mode');
    label();
    toggle.addEventListener('click',()=>{
      root.dataset.theme=root.dataset.theme==='light'?'dark':'light';
      try{localStorage.setItem('lead-finder-theme',root.dataset.theme);}catch{}
      label();
    });
  });
})();
