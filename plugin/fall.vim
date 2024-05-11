if exists('g:loaded_fall')
  finish
endif
let g:loaded_fall = 1

command! -nargs=*
      \ -complete=customlist,fall#command#Fall#complete
      \ Fall call fall#command#Fall#call(<q-args>)

command! -nargs=0
      \ FallRestore call fall#command#FallRestore#call()

command! -nargs=0
      \ FallConfig call fall#command#FallConfig#call()
