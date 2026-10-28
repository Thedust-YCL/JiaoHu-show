/** Browser-local export. An accepted request cannot prove the user saved it. */
export function downloadLocalFile({content,filename,type='text/plain;charset=utf-8'}) {
  let url=null;
  try {
    if(typeof document==='undefined'||typeof URL.createObjectURL!=='function')throw new Error('浏览器本地下载能力不可用');
    url=URL.createObjectURL(new Blob([content],{type}));
    const link=document.createElement('a');
    link.href=url;link.download=filename;link.hidden=true;
    document.body.append(link);
    try {link.click();}finally{link.remove();}
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    return {ok:true,message:'已生成文件并请求浏览器下载，请查看下载列表。'};
  } catch(error) {
    if(url)URL.revokeObjectURL(url);
    return {ok:false,message:`无法导出：${error instanceof Error?error.message:String(error)}。请保留当前页面，检查浏览器下载权限后重试。`};
  }
}
