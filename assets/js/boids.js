(function() {
    // Vector helper to mimic p5.Vector logic
    class Vector {
        constructor(x, y) {
            this.x = x || 0;
            this.y = y || 0;
        }
        add(v) { this.x += v.x; this.y += v.y; return this; }
        sub(v) { this.x -= v.x; this.y -= v.y; return this; }
        mult(n) { this.x *= n; this.y *= n; return this; }
        div(n) { this.x /= n; this.y /= n; return this; }
        mag() { return Math.sqrt(this.x * this.x + this.y * this.y); }
        normalize() {
            let m = this.mag();
            if (m > 0) this.div(m);
            return this;
        }
        limit(max) {
            if (this.mag() > max) {
                this.normalize();
                this.mult(max);
            }
            return this;
        }
        static sub(v1, v2) { return new Vector(v1.x - v2.x, v1.y - v2.y); }
        static dist(v1, v2) { return Math.sqrt((v1.x - v2.x)**2 + (v1.y - v2.y)**2); }
    }

    const canvas = document.createElement('canvas');
    canvas.id = 'boids-canvas';
    document.body.prepend(canvas);
    const ctx = canvas.getContext('2d');

    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.zIndex = '-1';
    canvas.style.pointerEvents = 'none';

    let width, height;
    let textRects = [];

    function updateTextRects() {
        textRects = [];
        const selector = '.blog-index h1, .blog-index p, .blog-index span, .blog-index a, .posts-header h1, .digital-clock';
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
            const rect = el.getBoundingClientRect();
            textRects.push({
                x: rect.left,
                y: rect.top,
                w: rect.width,
                h: rect.height,
                center: new Vector(rect.left + rect.width / 2, rect.top + rect.height / 2)
            });
        });
    }

    function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
        updateTextRects();
    }
    
    window.addEventListener('resize', resize);
    setTimeout(resize, 100);

    let mouse = new Vector(-1000, -1000);
    let isMouseDown = false;

    document.addEventListener('mousemove', (e) => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        if (isMouseDown) spawnBoid(e.clientX, e.clientY);
    });

    document.addEventListener('mousedown', (e) => {
        if (e.target.closest('a, button, input, textarea, .digital-clock')) return;
        e.preventDefault();
        isMouseDown = true;
        spawnBoid(e.clientX, e.clientY);
    });

    document.addEventListener('mouseup', () => isMouseDown = false);

    let lastSpawnTime = 0;
    function spawnBoid(x, y) {
        const now = Date.now();
        if (now - lastSpawnTime > 30) {
            boids.push(new Boid(x, y));
            lastSpawnTime = now;
            
            if (boids.length >= 20) {
                document.body.classList.add('underwater-active');
            }
        }
    }

    const boids = [];
    const image = new Image();
    image.src = '/assets/images/clownfish.svg';

    class Boid {
        constructor(x, y) {
            this.position = new Vector(x, y);
            this.velocity = new Vector(Math.random() * 2 - 1, Math.random() * 2 - 1);
            this.acceleration = new Vector(0, 0);
            this.maxspeed = 4;
            this.maxforce = 0.1;
            this.r = 10;
        }

        run(boids) {
            this.flock(boids);
            this.update();
            this.borders();
            this.render();
        }

        applyForce(force) {
            this.acceleration.add(force);
        }

        flock(boids) {
            let sep = this.separate(boids);
            let ali = this.align(boids);
            let coh = this.cohesion(boids);
            let avoidMouse = this.flee(mouse, 120);
            let avoidText = this.avoidRects(textRects, 40);

            sep.mult(3.5);
            ali.mult(1.5);
            coh.mult(1.5);
            avoidMouse.mult(4.0);
            avoidText.mult(5.0);

            this.applyForce(sep);
            this.applyForce(ali);
            this.applyForce(coh);
            this.applyForce(avoidMouse);
            this.applyForce(avoidText);
        }

        update() {
            this.velocity.add(this.acceleration);
            this.velocity.limit(this.maxspeed);
            this.position.add(this.velocity);
            this.acceleration.mult(0);
        }

        seek(target) {
            let desired = Vector.sub(target, this.position);
            desired.normalize();
            desired.mult(this.maxspeed);
            let steer = Vector.sub(desired, this.velocity);
            steer.limit(this.maxforce);
            return steer;
        }

        flee(target, radius) {
            let d = Vector.dist(this.position, target);
            if (d < radius) {
                let desired = Vector.sub(this.position, target);
                desired.normalize();
                desired.mult(this.maxspeed);
                let steer = Vector.sub(desired, this.velocity);
                steer.limit(this.maxforce);
                return steer;
            }
            return new Vector(0, 0);
        }

        avoidRects(rects, buffer) {
            let steer = new Vector(0, 0);
            let count = 0;
            for (let rect of rects) {
                if (this.position.x > rect.x - buffer && this.position.x < rect.x + rect.w + buffer &&
                    this.position.y > rect.y - buffer && this.position.y < rect.y + rect.h + buffer) {
                    let diff = Vector.sub(this.position, rect.center);
                    diff.normalize();
                    steer.add(diff);
                    count++;
                }
            }
            if (count > 0) {
                steer.div(count);
                steer.normalize();
                steer.mult(this.maxspeed);
                steer.sub(this.velocity);
                steer.limit(this.maxforce);
            }
            return steer;
        }

        render() {
            if (!image.complete) return;
            let theta = Math.atan2(this.velocity.y, this.velocity.x);
            ctx.save();
            ctx.translate(this.position.x, this.position.y);
            ctx.rotate(theta + Math.PI); // Rotate 180 degrees to fix head direction
            ctx.drawImage(image, -this.r, -this.r, this.r * 2, this.r * 2);
            ctx.restore();
        }

        borders() {
            if (this.position.x < -this.r) this.position.x = width + this.r;
            if (this.position.y < -this.r) this.position.y = height + this.r;
            if (this.position.x > width + this.r) this.position.x = -this.r;
            if (this.position.y > height + this.r) this.position.y = -this.r;
        }

        separate(boids) {
            let desiredseparation = 25.0;
            let steer = new Vector(0, 0);
            let count = 0;
            for (let other of boids) {
                let d = Vector.dist(this.position, other.position);
                if (d > 0 && d < desiredseparation) {
                    let diff = Vector.sub(this.position, other.position);
                    diff.normalize();
                    diff.div(d);
                    steer.add(diff);
                    count++;
                }
            }
            if (count > 0) steer.div(count);
            if (steer.mag() > 0) {
                steer.normalize();
                steer.mult(this.maxspeed);
                steer.sub(this.velocity);
                steer.limit(this.maxforce);
            }
            return steer;
        }

        align(boids) {
            let neighbordist = 50;
            let sum = new Vector(0, 0);
            let count = 0;
            for (let other of boids) {
                let d = Vector.dist(this.position, other.position);
                if (d > 0 && d < neighbordist) {
                    sum.add(other.velocity);
                    count++;
                }
            }
            if (count > 0) {
                sum.div(count);
                sum.normalize();
                sum.mult(this.maxspeed);
                let steer = Vector.sub(sum, this.velocity);
                steer.limit(this.maxforce);
                return steer;
            }
            return new Vector(0, 0);
        }

        cohesion(boids) {
            let neighbordist = 50;
            let sum = new Vector(0, 0);
            let count = 0;
            for (let other of boids) {
                let d = Vector.dist(this.position, other.position);
                if (d > 0 && d < neighbordist) {
                    sum.add(other.position);
                    count++;
                }
            }
            if (count > 0) {
                sum.div(count);
                return this.seek(sum);
            }
            return new Vector(0, 0);
        }
    }

    function animate() {
        ctx.clearRect(0, 0, width, height);
        for (let boid of boids) {
            boid.run(boids);
        }
        requestAnimationFrame(animate);
    }
    animate();

})();
