function! fall#command#FallCustom#call() abort
  if denops#plugin#wait('fall') isnot# 0
    return
  endif
  call denops#notify('fall', 'custom:edit', [])
endfunction
