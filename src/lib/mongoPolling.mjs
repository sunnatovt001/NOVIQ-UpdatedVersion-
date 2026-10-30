// Adaptive polling for the serverless transport. Hidden/offline tabs do no work.
// Writes and foreground/online events bypass the idle backoff immediately.
export function createPollingLoop({read,deliver,onError,isActive=()=>true,setTimer=setTimeout,clearTimer=clearTimeout}) {
  let stopped=false,inFlight=false,rerun=false,timer,lastSignature,idle=0;
  const schedule=delay=>{clearTimer(timer);if(!stopped)timer=setTimer(poll,delay);};
  async function poll(){
    if(stopped)return;
    if(inFlight){rerun=true;return;}
    if(!isActive())return;
    inFlight=true;
    try{
      const result=await read();
      if(stopped)return;
      const signature=JSON.stringify(result),changed=signature!==lastSignature;
      idle=changed?0:Math.min(idle+1,4);lastSignature=signature;
      deliver(result,changed);
    }catch(cause){idle=Math.min(idle+1,4);if(!stopped)onError(cause);}
    finally{
      inFlight=false;
      if(!stopped){if(rerun){rerun=false;schedule(0);}else if(isActive())schedule(Math.min(60000,5000*2**idle));}
    }
  }
  return {
    refresh(){clearTimer(timer);idle=0;void poll();},
    pause(){clearTimer(timer);},
    stop(){stopped=true;clearTimer(timer);},
  };
}
