window.CaviarStore={
 open(){return new Promise((resolve,reject)=>{const r=indexedDB.open('caviar-concepts-editor',1);r.onupgradeneeded=()=>r.result.createObjectStore('documents');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});},
 async get(){const db=await this.open();return new Promise((resolve,reject)=>{const t=db.transaction('documents');const r=t.objectStore('documents').get('draft');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);t.oncomplete=()=>db.close();});},
 async put(data){const db=await this.open();return new Promise((resolve,reject)=>{const t=db.transaction('documents','readwrite');t.objectStore('documents').put(data,'draft');t.oncomplete=()=>{db.close();resolve();};t.onerror=()=>{db.close();reject(t.error);};t.onabort=()=>reject(t.error);});}
};
CaviarStore.getPublishBase=async function(){const db=await this.open();return new Promise((resolve,reject)=>{const t=db.transaction('documents'),r=t.objectStore('documents').get('publish-base');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);t.oncomplete=()=>db.close();});};
CaviarStore.putPublishBase=async function(value){const db=await this.open();return new Promise((resolve,reject)=>{const t=db.transaction('documents','readwrite');t.objectStore('documents').put(value,'publish-base');t.oncomplete=()=>{db.close();resolve();};t.onerror=()=>reject(t.error);});};
